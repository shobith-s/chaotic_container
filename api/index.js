import { fetch } from 'undici';

const GITHUB_API_URL = "https://api.github.com/graphql";

const query = `
  query UserMetrics($login: String!) {
    user(login: $login) {
      login
      name
      createdAt
      avatarUrl
      followers { totalCount }
      gists { totalCount }
      sponsorshipsAsSponsor { totalCount }
      contributionsCollection {
        totalCommitContributions
        totalPullRequestReviewContributions
      }
      repositoryDiscussionComments { totalCount }
      issues(states: CLOSED) { totalCount }
      pullRequests { totalCount }
      repositories(
        privacy: PUBLIC, ownerAffiliations: OWNER, isFork: false, first: 100, orderBy: { field: STARGAZERS, direction: DESC }
      ) {
        nodes {
          stargazerCount
          primaryLanguage { name color }
        }
      }
    }
  }
`;

function buildHeaders(token) {
  return { "Content-Type": "application/json", Authorization: `bearer ${token}` };
}

async function fetchGitHubData(token, username) {
  const response = await fetch(GITHUB_API_URL, {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify({ query, variables: { login: username } }),
  });
  if (!response.ok) throw new Error(await response.text());
  const body = await response.json();
  if (body.errors) throw new Error(body.errors.map(e => e.message).join("; "));
  return body.data;
}

function calculateRank(score) {
  if (score > 1000) return { level: "S+", title: "LEGEND" };
  if (score > 500) return { level: "S", title: "SENIOR" };
  if (score > 200) return { level: "A", title: "ENGINEER" };
  if (score > 100) return { level: "B", title: "BUILDER" };
  return { level: "C", title: "ROOKIE" };
}

function mapMetrics(user) {
  const commits = user?.contributionsCollection?.totalCommitContributions ?? 0;
  const reviews = user?.contributionsCollection?.totalPullRequestReviewContributions ?? 0;
  const discussionComments = user?.repositoryDiscussionComments?.totalCount ?? 0;
  const closedIssues = user?.issues?.totalCount ?? 0;
  const openedPRs = user?.pullRequests?.totalCount ?? 0;
  const followers = user?.followers?.totalCount ?? 0;
  
  const repos = user?.repositories?.nodes ?? [];
  const stars = repos.reduce((sum, repo) => sum + (repo?.stargazerCount ?? 0), 0);
  
  // --- LANGUAGE CALCULATIONS (The Swatch) ---
  const langCounts = {};
  let totalReposWithLang = 0;
  repos.forEach(repo => { 
    if (repo.primaryLanguage?.name) {
      const name = repo.primaryLanguage.name;
      const color = repo.primaryLanguage.color;
      if (!langCounts[name]) langCounts[name] = { count: 0, color };
      langCounts[name].count++;
      totalReposWithLang++;
    }
  });

  const topLanguages = Object.entries(langCounts)
    .sort(([,a], [,b]) => b.count - a.count)
    .slice(0, 4) // Top 4
    .map(([name, data]) => ({
      name,
      color: data.color || "#ccc",
      percent: Math.round((data.count / totalReposWithLang) * 100)
    }));

  // --- SCORE & RANK ---
  const createdYear = new Date(user.createdAt).getFullYear();
  const impactScore = Math.floor((reviews * 2) + (discussionComments * 3) + (commits * 0.1) + (stars * 1.5));
  const rank = calculateRank(impactScore);

  return {
    username: user?.login,
    name: user?.name || user?.login,
    avatar: user?.avatarUrl,
    commits, reviews, discussionComments, stars,
    impactScore,
    rank,
    topLanguages,
    createdYear
  };
}

function generateSVG(metrics) {
  const css = `
    .bg { fill: #1a1b27; }
    .text-hand { font-family: 'Comic Sans MS', 'Chalkboard SE', 'Marker Felt', sans-serif; font-weight: bold; }
    .text-mono { font-family: 'Courier New', Courier, monospace; letter-spacing: -0.5px; }
    .text-header { font-family: 'Impact', sans-serif; letter-spacing: 1px; }
    .shadow { filter: drop-shadow(3px 3px 2px rgba(0,0,0,0.3)); }
    .sticky-yellow { fill: #f1fa8c; }
    .card-white { fill: #f8f8f2; stroke: #e0e0e0; stroke-width: 1; }
    .badge { fill: #282a36; stroke: #6272a4; stroke-width: 2; }
    .tape { fill: rgba(255, 255, 255, 0.3); }
    .swatch { stroke: #fff; stroke-width: 2; }
  `;

  // Helper to generate language bars
  const langBars = metrics.topLanguages.map((lang, i) => {
    return `
      <g transform="translate(10, ${35 + (i * 25)})">
        <circle cx="10" cy="0" r="8" fill="${lang.color}" class="swatch"/>
        <text x="25" y="4" font-size="10" class="text-mono" fill="#333">${lang.name} (${lang.percent}%)</text>
        <rect x="25" y="8" width="${lang.percent}" height="4" fill="${lang.color}" rx="2" opacity="0.6"/>
      </g>
    `;
  }).join('');

  return `
    <svg width="800" height="400" viewBox="0 0 800 400" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>${css}</style>
        <clipPath id="round"><circle cx="25" cy="25" r="25"/></clipPath>
      </defs>

      <rect width="100%" height="100%" class="bg" />
      
      <text x="50%" y="350" text-anchor="middle" fill="#242636" font-size="150" font-weight="900" class="text-header" transform="rotate(-5, 400, 200)">
        ${metrics.rank.title}
      </text>

      <g transform="translate(80, -20)">
        <path d="M 60 0 L 60 40" stroke="#333" stroke-width="4"/>
        <g transform="translate(0, 40) rotate(2)" class="shadow">
          <rect x="0" y="0" width="120" height="180" rx="10" class="badge" />
          <rect x="0" y="0" width="120" height="40" rx="10" fill="#44475a" />
          <rect x="0" y="20" width="120" height="20" fill="#44475a" /> <text x="60" y="25" text-anchor="middle" fill="#fff" font-size="12" class="text-header">ACCESS CARD</text>
          
          <circle cx="60" cy="80" r="30" fill="#6272a4" />
          <text x="60" y="85" text-anchor="middle" font-size="20" fill="#fff">👾</text>
          
          <text x="60" y="130" text-anchor="middle" fill="#bd93f9" font-size="10" class="text-mono">CLEARANCE LEVEL</text>
          <text x="60" y="160" text-anchor="middle" fill="#50fa7b" font-size="40" class="text-header">${metrics.rank.level}</text>
        </g>
      </g>

      <g transform="translate(250, 80) rotate(-4)" class="shadow">
        <rect x="0" y="0" width="160" height="140" class="sticky-yellow" />
        <rect x="60" y="-10" width="40" height="20" class="tape" />
        <text x="20" y="30" font-size="14" fill="#44475a" class="text-hand">Contributions:</text>
        <text x="80" y="90" font-size="50" text-anchor="middle" fill="#282a36" class="text-hand">${metrics.commits}</text>
      </g>

      <g transform="translate(230, 250) rotate(5)" class="shadow">
        <rect x="0" y="0" width="160" height="140" class="card-white" rx="5" />
        <text x="10" y="20" font-size="12" fill="#555" class="text-header">PALETTE</text>
        <line x1="10" y1="25" x2="150" y2="25" stroke="#ccc" stroke-width="1"/>
        
        ${langBars}
        
        <rect x="60" y="-10" width="40" height="20" class="tape" />
      </g>

      <g transform="translate(550, 50) rotate(3)" class="shadow">
        <rect x="0" y="0" width="200" height="280" fill="#f8f8f2" />
        <text x="100" y="30" text-anchor="middle" class="text-mono" font-weight="bold" font-size="14">STATS.LOG</text>
        <line x1="20" y1="40" x2="180" y2="40" stroke="#444" stroke-dasharray="4" />
        
        <text x="20" y="70" class="text-mono" font-size="11" fill="#282a36">USER: ${metrics.username}</text>
        <text x="20" y="100" class="text-mono" font-size="11" fill="#282a36">REVIEWS ....... ${metrics.reviews}</text>
        <text x="20" y="120" class="text-mono" font-size="11" fill="#282a36">ANSWERS ....... ${metrics.discussionComments}</text>
        <text x="20" y="140" class="text-mono" font-size="11" fill="#282a36">STARS ......... ${metrics.stars}</text>
        <text x="20" y="160" class="text-mono" font-size="11" fill="#282a36">FOLLOWERS ..... ${metrics.followers}</text>
        
        <text x="100" y="220" text-anchor="middle" class="text-mono" font-size="10" fill="#888">EST. ${metrics.createdYear}</text>
        <rect x="50" y="240" width="100" height="20" fill="#282a36" />
        
        <rect x="80" y="-10" width="40" height="20" class="tape" />
      </g>

      <g transform="translate(420, 200) rotate(-15)">
        <circle cx="0" cy="0" r="60" fill="none" stroke="#ff5555" stroke-width="5" stroke-dasharray="100 10" opacity="0.8"/>
        <text x="0" y="-10" text-anchor="middle" font-size="12" fill="#ff5555" class="text-header" opacity="0.9">IMPACT SCORE</text>
        <text x="0" y="30" text-anchor="middle" font-size="45" fill="#ff5555" class="text-header" opacity="0.9">${metrics.impactScore}</text>
      </g>

    </svg>
  `;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const token = process.env.GH_TOKEN;
  const username = req.query?.username;

  if (!token || !username) return res.status(400).send("Missing parameters");

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
