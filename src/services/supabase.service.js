import { createClient } from '@supabase/supabase-js';

let supabaseClient;

function getClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) return null;
  if (!supabaseClient) {
    supabaseClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  }
  return supabaseClient;
}

function projectName(repoUrl) {
  try {
    return new URL(repoUrl).pathname.replace(/^\/|\/$/g, '').replace(/\.git$/, '');
  } catch {
    return repoUrl;
  }
}

const depKey = (dep) => JSON.stringify([dep.name, dep.version, dep.ecosystem]);

export async function upsertProject(repoUrl) {
  const sb = getClient();
  if (!sb || !repoUrl) return null;

  const { data, error } = await sb
    .from('projects')
    .upsert({ repo_url: repoUrl, name: projectName(repoUrl) }, { onConflict: 'repo_url' })
    .select('id, repo_url, name')
    .single();

  if (error) throw error;
  return data;
}

export async function getCachedVulnerabilities(dependencies) {
  const sb = getClient();
  if (!sb) return [];

  const keys = new Set(dependencies.map(depKey));
  const { data, error } = await sb
    .from('vulnerabilities')
    .select('id, package_name, version, ecosystem, affected_versions, fixed_versions, severity, osv_id');

  if (error) throw error;
  return (data || []).filter(row => keys.has(JSON.stringify([row.package_name, row.version, row.ecosystem])));
}

export async function upsertVulnerabilities(rows) {
  const sb = getClient();
  if (!sb || !rows.length) return [];

  const { data, error } = await sb
    .from('vulnerabilities')
    .upsert(
      rows.map(({ package_name, version, ecosystem, affected_versions, fixed_versions, severity, osv_id }) => ({
        package_name, version, ecosystem, affected_versions, fixed_versions, severity, osv_id
      })),
      { onConflict: 'package_name,version,ecosystem,osv_id' }
    )
    .select('id, package_name, version, ecosystem, affected_versions, fixed_versions, severity, osv_id');

  if (error) throw error;
  return data || [];
}

export async function linkProjectVulnerabilities(projectId, vulnerabilities) {
  const sb = getClient();
  if (!sb || !projectId || !vulnerabilities.length) return;

  const links = vulnerabilities
    .filter(v => v.id)
    .map(v => ({ project_id: projectId, vulnerability_id: v.id }));

  if (!links.length) return;

  const { error } = await sb
    .from('project_vulnerabilities')
    .upsert(links, { onConflict: 'project_id,vulnerability_id' });

  if (error) throw error;
}

export async function getProjectVulnerabilities(repoUrl) {
  const sb = getClient();
  if (!sb) return { project: null, vulnerabilities: [] };

  // get project
  const { data: project, error: pErr } = await sb
    .from('projects')
    .select('id, repo_url, name')
    .eq('repo_url', repoUrl)
    .single();

  if (pErr || !project) return { project: null, vulnerabilities: [] };

  // get all vulns linked to this project
  const { data, error } = await sb
    .from('project_vulnerabilities')
    .select(`
      vulnerability_id,
      vulnerabilities (
        id, package_name, version, ecosystem,
        affected_versions, fixed_versions, severity, osv_id
      )
    `)
    .eq('project_id', project.id);

  if (error) throw error;

  const vulnerabilities = (data || [])
    .map(row => row.vulnerabilities)
    .filter(Boolean);

  return { project, vulnerabilities };
}