import axios from 'axios';
import { chunkArray } from '../utils/chunk.js';
import { deduplicateDependencies } from '../utils/deduplicate.js';
import { getCachedVulnerabilities, linkProjectVulnerabilities, upsertProject, upsertVulnerabilities } from './supabase.service.js';

const OSV_BATCH_URL = 'https://api.osv.dev/v1/querybatch';
const OSV_VULN_URL = 'https://api.osv.dev/v1/vulns';
const BATCH_SIZE = 50;

const OSV_ECOSYSTEMS = { npm: 'npm', pypi: 'PyPI', maven: 'Maven' };

const depKey = (dep) => `${dep.ecosystem}:${dep.name}:${dep.version}`;
const cacheKey = (dep) => JSON.stringify([dep.name, dep.version, dep.ecosystem]);

function normalizeVersion(version) {
  const value = String(version || '').trim();
  if (!value || ['*', 'latest', 'unknown'].includes(value.toLowerCase())) return null;
  if (value.startsWith('${') && value.endsWith('}')) return null;
  return value.match(/\d+(?:\.\d+){0,3}(?:[-+][0-9A-Za-z.-]+)?/)?.[0] || null;
}

function parseCvssVector(vector) {
  if (!vector?.startsWith('CVSS:3.')) return null;

  const m = Object.fromEntries(vector.split('/').slice(1).map(p => p.split(':')));
  const av = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 }[m.AV];
  const ac = { L: 0.77, H: 0.44 }[m.AC];
  const ui = { N: 0.85, R: 0.62 }[m.UI];
  const c  = { H: 0.56, L: 0.22, N: 0 }[m.C];
  const i  = { H: 0.56, L: 0.22, N: 0 }[m.I];
  const a  = { H: 0.56, L: 0.22, N: 0 }[m.A];

  if ([av, ac, ui, c, i, a].some(x => x === undefined)) return null;

  const scopeChanged = m.S === 'C';
  const pr = (scopeChanged ? { N: 0.85, L: 0.68, H: 0.5 } : { N: 0.85, L: 0.62, H: 0.27 })[m.PR];
  if (pr === undefined) return null;

  const impact = 1 - (1 - c) * (1 - i) * (1 - a);
  const iss = scopeChanged
    ? 7.52 * (impact - 0.029) - 3.25 * Math.pow(impact - 0.02, 15)
    : 6.42 * impact;
  if (iss <= 0) return 0;

  const exploitability = 8.22 * av * ac * pr * ui;
  const base = scopeChanged
    ? Math.min(1.08 * (iss + exploitability), 10)
    : Math.min(iss + exploitability, 10);

  return Math.ceil(base * 10) / 10;
}

function severityFromScore(score) {
  if (score >= 7) return 'HIGH';
  if (score >= 4) return 'MEDIUM';
  if (score > 0)  return 'LOW';
  return 'UNKNOWN';
}

function normalizeSeverityLabel(label) {
  const s = label?.toUpperCase();
  if (s === 'CRITICAL' || s === 'HIGH') return 'HIGH';
  if (s === 'MODERATE' || s === 'MEDIUM') return 'MEDIUM';
  if (s === 'LOW') return 'LOW';
  return null;
}

function getSeverity(vuln) {
  for (const entry of vuln.severity || []) {
    const n = Number.parseFloat(entry.score);
    const score = Number.isFinite(n) ? n : parseCvssVector(entry.score);
    if (score !== null) return { severity: severityFromScore(score), score };
  }
  const s = normalizeSeverityLabel(vuln.database_specific?.severity)
    || normalizeSeverityLabel(vuln.ecosystem_specific?.severity || vuln.ecosystem_specific?.severity_label);
  return { severity: s || 'UNKNOWN', score: null };
}

function getVersionInfo(vuln) {
  const events = vuln.affected?.flatMap(a => a.ranges?.flatMap(r => r.events || []) || []) || [];
  const introduced = events.find(e => e.introduced)?.introduced;
  const fixedVersions = [...new Set(events.filter(e => e.fixed).map(e => e.fixed))];
  return { affectedVersions: introduced ? `>=${introduced}` : '', fixedVersions };
}

function formatVuln(vuln) {
  const { severity, score } = getSeverity(vuln);
  const { affectedVersions, fixedVersions } = getVersionInfo(vuln);
  const cveIds = (vuln.aliases || []).filter(a => a.startsWith('CVE-'));
  return {
    id: vuln.id,
    aliases: vuln.aliases || [],
    cveIds,
    cveId: cveIds[0] || null,
    summary: vuln.summary || '',
    severity,
    score,
    affectedVersions,
    fixedVersions,
  };
}

function formatCachedVuln(row) {
  const score = Number.isFinite(Number.parseFloat(row.severity)) ? Number.parseFloat(row.severity) : null;
  return {
    id: row.osv_id,
    aliases: [],
    cveIds: row.osv_id?.startsWith('CVE-') ? [row.osv_id] : [],
    cveId: row.osv_id?.startsWith('CVE-') ? row.osv_id : null,
    summary: '',
    severity: score !== null ? severityFromScore(score) : (normalizeSeverityLabel(row.severity) || 'UNKNOWN'),
    score,
    affectedVersions: row.affected_versions || '',
    fixedVersions: row.fixed_versions?.split(',').map(v => v.trim()).filter(Boolean) || [],
  };
}

function highestRisk(vulns) {
  const order = { HIGH: 3, MEDIUM: 2, LOW: 1, UNKNOWN: 0 };
  return vulns.reduce((highest, v) => order[v.severity] > order[highest] ? v.severity : highest, 'UNKNOWN');
}

async function queryOSVBatch(dependencies) {
  const { data } = await axios.post(OSV_BATCH_URL, {
    queries: dependencies.map(dep => ({
      package: { name: dep.name, ecosystem: OSV_ECOSYSTEMS[dep.ecosystem] },
      version: dep.queryVersion,
    }))
  }, { headers: { 'Content-Type': 'application/json' } });
  return data.results || [];
}

async function enrichVulns(vulns) {
  return Promise.all(vulns.map(async vuln => {
    const formatted = formatVuln(vuln);
    const needsEnrichment = formatted.severity === 'UNKNOWN' || !formatted.summary || (!formatted.affectedVersions && !formatted.fixedVersions.length);
    if (!needsEnrichment) return formatted;
    try {
      const { data } = await axios.get(`${OSV_VULN_URL}/${encodeURIComponent(vuln.id)}`);
      return formatVuln(data);
    } catch {
      return formatted;
    }
  }));
}

export async function scanVulnerabilities(dependencies, options = {}) {
  const project = await upsertProject(options.repoUrl);

  const uniqueDeps = deduplicateDependencies(dependencies).map(dep => ({
    ...dep,
    queryVersion: normalizeVersion(dep.version),
  }));

  const results = new Map(uniqueDeps.map(dep => [depKey(dep), {
    risk: dep.queryVersion ? 'NONE' : 'UNKNOWN',
    vulnerabilities: [],
    scannedVersion: dep.queryVersion,
  }]));

  const cachedRows = await getCachedVulnerabilities(uniqueDeps);
  const cachedKeys = new Set(cachedRows.map(r => JSON.stringify([r.package_name, r.version, r.ecosystem])));

  // load cached results into map
  const rowsByDep = new Map();
  for (const row of cachedRows) {
    const key = JSON.stringify([row.package_name, row.version, row.ecosystem]);
    rowsByDep.set(key, [...(rowsByDep.get(key) || []), row]);
  }
  for (const [key, rows] of rowsByDep) {
    const vulns = rows.map(formatCachedVuln);
    results.set(`${rows[0].ecosystem}:${rows[0].package_name}:${rows[0].version}`, {
      risk: vulns.length ? highestRisk(vulns) : 'NONE',
      vulnerabilities: vulns,
      scannedVersion: normalizeVersion(rows[0].version),
      cached: true,
    });
  }

  if (project) await linkProjectVulnerabilities(project.id, cachedRows);

  // query OSV for uncached deps
  const queryable = uniqueDeps.filter(dep =>
    dep.queryVersion && OSV_ECOSYSTEMS[dep.ecosystem] && !cachedKeys.has(cacheKey(dep))
  );

  for (const batch of chunkArray(queryable, BATCH_SIZE)) {
    const batchResults = await queryOSVBatch(batch);
    const rows = [];

    await Promise.all(batch.map(async (dep, i) => {
      const vulns = await enrichVulns(batchResults[i]?.vulns || []);
      results.set(depKey(dep), {
        risk: vulns.length ? highestRisk(vulns) : 'NONE',
        vulnerabilities: vulns,
        scannedVersion: dep.queryVersion,
      });
      rows.push(...vulns.map(v => ({
        package_name: dep.name,
        version: dep.version,
        ecosystem: dep.ecosystem,
        affected_versions: v.affectedVersions,
        fixed_versions: v.fixedVersions.join(', '),
        severity: v.score,
        osv_id: v.id,
      })));
    }));

    const upserted = await upsertVulnerabilities(rows);
    if (project) await linkProjectVulnerabilities(project.id, upserted);
  }

  return results;
}