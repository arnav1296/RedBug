# github-vuln-analyzer

GitHub dependency vulnerability analyzer API scaffold built with Node.js and Express. The current implementation wires the API shape end to end with placeholder service functions for fetching a GitHub `package.json`, reading npm package metadata, checking OSV vulnerabilities, and producing a risk summary.

## Setup

```bash
npm install
copy .env.example .env
npm run dev
```

On macOS or Linux, copy the environment file with:

```bash
cp .env.example .env
```

The API listens on the port configured by `PORT` in `.env`, defaulting to `3000`.

## API Usage

Analyze a GitHub repository:

```bash
curl -X POST http://localhost:3000/analyze ^
  -H "Content-Type: application/json" ^
  -d "{\"repoUrl\":\"https://github.com/octocat/hello-world\"}"
```

On macOS or Linux:

```bash
curl -X POST http://localhost:3000/analyze \
  -H "Content-Type: application/json" \
  -d '{"repoUrl":"https://github.com/octocat/hello-world"}'
```

Example placeholder response:

```json
{
  "ecosystem": "npm",
  "files": ["README.md", "package.json"]
}
```
