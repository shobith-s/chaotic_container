import { fetch } from 'undici';

const GITHUB_API_URL = "https://api.github.com/graphql";

// ✅ FIX: Moved discussion comments OUT of contributionsCollection
const query = `
  query UserMetrics($login: String!) {
    user(login: $login) {
      login
      name
      avatarUrl
      contributionsCollection {
        totalCommitContributions
        totalPullRequestReviewContributions
      }
      # Correct location for discussion comments
      repositoryDiscussionComments {
        totalCount
      }
      issues(states: CLOSED) {
        totalCount
      }
      repositories(
        privacy: PUBLIC
        ownerAffiliations: OWNER
        isFork: false
        first: 100
        orderBy: { field: STARGAZERS, direction: DESC }
      ) {
        nodes {
          stargazerCount
        }
      }
    }
  }
`;

function buildHeaders(token) {
  return {
    "Content-Type": "application/json",
    Authorization: `bearer ${token}`,
  };
}

async function fetchGitHubData(token, username) {
  const response = await fetch(GITHUB_API_URL, {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify({ query, variables: { login: username } }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`GitHub API error (${response.status}): ${errorBody}`);
  }

  const body = await response.json();

  if (body.errors) {
    const messages = body.errors.map((error) => error.message).join("; ");
    throw new Error(`GitHub API returned errors: ${messages}`);
  }

  return body.data;
}

function mapMetrics(user) {
  const commits = user?.contributionsCollection?.totalCommitContributions ?? 0;
  const reviews = user?.contributionsCollection?.totalPullRequestReviewContributions ?? 0;
  
  // ✅ FIX: Updated path to match the new query structure
  const discussionComments = user?.repositoryDiscussionComments?.totalCount ?? 0;
  
  const closedIssues = user?.issues?.totalCount ?? 0;
  const stars = (user?.repositories?.nodes ?? []).reduce(
    (sum, repo) => sum + (repo?.stargazerCount ?? 0),
    0,
  );

  // --- IMPACT ALGORITHM ---
  const impactScore = Math.floor(
    (reviews * 2) + 
    (discussionComments * 3) + 
    (commits * 0.1) + 
    (stars * 1.5)
  );

  return {
    username: user?.login,
    name: user?.name || user?.login,
    commits,
    reviews,
    discussionComments,
    closedIssues,
    stars,
    impactScore,
  };
}

// --- CHAOTIC SVG GENERATOR ---
function generateSVG(metrics) {
  const css = `
    .bg { fill: #1a1b27; }
    .text-hand { font-family: 'Comic Sans MS', 'Chalkboard SE', 'Marker Felt', sans-serif; font-weight: bold; }
    .text-mono { font-family: 'Courier New', Courier, monospace; letter-spacing: -0.5px; }
    .text-bold { font-family: 'Segoe UI', Roboto, sans-serif; font-weight: 800; }
    
    .sticky { fill: #f1fa8c; stroke: rgba(0,0,0,0.1); stroke-width: 1; }
    .sticky-shadow { fill: rgba(0,0,0,0.4); filter: blur(4px); }
    
    .stamp-ring { fill: none; stroke: #ff5555; stroke-width: 3; stroke-dasharray: 8,4; opacity: 0.8; }
    .stamp-text { fill: #ff5555; font-weight: 900; text-transform: uppercase; opacity: 0.9; }
    
    .receipt { fill: #f8f8f2; }
    .receipt-text { fill: #282a36; font-size: 12px; }
    
    .tape { fill: rgba(255, 255, 255, 0.2); stroke: rgba(255,255,255,0.1); }
  `;

  return `
    <svg width="800" height="400" viewBox="0 0 800 400" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>${css}</style>
      </defs>

      <rect width="100%" height="100%" class="bg" />
      
      <text x="50%" y="80" text-anchor="middle" fill="#2d3045" font-size="120" font-weight="900" class="text-bold" transform="rotate(-2, 400, 200)">
        IMPACT
      </text>

      <g transform="translate(60, 60) rotate(-6)">
        <rect x="5" y="5" width="220" height="180" class="sticky-shadow" />
        <rect x="0" y="0" width="220" height="180" class="sticky" />
        <rect x="85" y="-15" width="50" height="25" class="tape" transform="rotate(2)" />
        <text x="20" y="40" font-size="20" fill="#44475a" class="text-hand">Total Commits:</text>
        <text x="110" y="120" font-size="60" text-anchor="middle" fill="#282a36" class="text-hand">${metrics.commits}</text>
      </g>

      <g transform="translate(500, 40) rotate(3)">
        <rect x="5" y="5" width="240" height="300" fill="rgba(0,0,0,0.5)" filter="blur(4px)" />
        <rect x="0" y="0" width="240" height="300" class="receipt" />
        <text x="120" y="30" text-anchor="middle" class="text-mono" font-weight="bold" font-size="14">GITHUB_ACTIVITY.LOG</text>
        <line x1="20" y1="40" x2="220" y2="40" stroke="#444" stroke-dasharray="4" />
        <text x="20" y="70" class="text-mono receipt-text">USER: ${metrics.username}</text>
        <text x="20" y="90" class="text-mono receipt-text">-------------------------</text>
        <text x="20" y="120" class="text-mono receipt-text">REVIEWS GIVEN ..... ${metrics.reviews}</text>
        <text x="20" y="145" class="text-mono receipt-text">DISCUSSIONS ....... ${metrics.discussionComments}</text>
        <text x="20" y="170" class="text-mono receipt-text">ISSUES CLOSED ..... ${metrics.closedIssues}</text>
        <text x="20" y="195" class="text-mono receipt-text">STARS EARNED ...... ${metrics.stars}</text>
        <text x="20" y="240" class="text-mono receipt-text">-------------------------</text>
        <rect x="95" y="-10" width="50" height="20" class="tape" />
      </g>

      <g transform="translate(250, 220) rotate(-10)">
        <circle cx="0" cy="0" r="70" class="stamp-ring" />
        <circle cx="0" cy="0" r="60" class="stamp-ring" stroke-width="1"/>
        <text x="0" y="-20" text-anchor="middle" font-size="14" class="text-bold stamp-text">SENIORITY SCORE</text>
        <text x="0" y="25" text-anchor="middle" font-size="50" class="text-bold stamp-text">${metrics.impactScore}</text>
      </g>
      
      <g transform="translate(50, 320)">
         <rect x="0" y="0" width="300" height="60" rx="30" fill="#282a36" stroke="#bd93f9" stroke-width="2"/>
         <text x="150" y="40" text-anchor="middle" fill="#f8f8f2" font-size="24" class="text-bold">@${metrics.username}</text>
      </g>
    </svg>
  `;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const token = process.env.GH_TOKEN;
  const username = req.query?.username;

  if (!token) return res.status(500).send("Error: Missing GH_TOKEN");
  if (!username) return res.status(400).send("Error: Missing username");

  try {
    const data = await fetchGitHubData(token, username);
    if (!data?.user) return res.status(404).send("User not found");

    const metrics = mapMetrics(data.user);
    const svg = generateSVG(metrics);

    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "public, max-age=14400, s-maxage=14400");
    res.status(200).send(svg);

  } catch (error) {
    console.error(error);
    res.status(500).send(`<svg viewBox="0 0 400 100"><text x="10" y="20" fill="red">Error: ${error.message}</text></svg>`);
  }
}
