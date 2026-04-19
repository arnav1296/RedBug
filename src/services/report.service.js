// NO SDK IMPORTS HERE

export async function generateReport(repoUrl) {
  const { project, vulnerabilities } = await getProjectVulnerabilities(repoUrl);

  if (!project) throw new Error(`Project not found: ${repoUrl}`);

  if (!vulnerabilities.length) {
    return {
      markdown: "## No vulnerabilities found",
      vulnerableCount: 0,
      generatedAt: new Date().toISOString(),
    };
  }

  // 🔥 limit to top 10
  const MAX_VULNS = 10;

  function severityRank(sev) {
    const map = { critical: 4, high: 3, medium: 2, low: 1 };
    return map[(sev || "").toLowerCase()] || 0;
  }

  const limitedVulns = vulnerabilities
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
    .slice(0, MAX_VULNS);

  const input = limitedVulns.map(v =>
    `${v.package_name}@${v.version} (${v.severity}) → fix: ${v.fixed_versions || "unknown"}`
  ).join("\n");

  // ✅ ACTUAL Mega LLM call
  const response = await fetch(`${process.env.MEGA_LLM_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.MEGA_LLM_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "mega-llm-fast",
      messages: [
        { role: "system", content: "Be concise." },
        { role: "user", content: `Summarize:\n${input}` }
      ],
      temperature: 0,
      max_tokens: 120,
    }),
  });

  const data = await response.json();

  return {
    markdown: data.choices?.[0]?.message?.content || "Failed to generate",
    vulnerableCount: vulnerabilities.length,
    shown: limitedVulns.length,
    generatedAt: new Date().toISOString(),
  };
}