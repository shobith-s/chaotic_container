import { fetch } from 'undici';

const GITHUB_API_URL = "https://api.github.com/graphql";

const query = `
  query UserMetrics($login: String!) {
    user(login: $login) {
      login
      name
      createdAt
      contributionsCollection {
        totalCommitContributions
        totalPullRequestReviewContributions
      }
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
          primaryLanguage {
            name
            color
          }
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
    throw new Error(`GitHub API returned errors: ${body.errors.map(e => e.message).join("; ")}`);
  }
  return body.data;
}

function mapMetrics(user) {
  const commits = user?.contributionsCollection?.totalCommitContributions ?? 0;
  const reviews = user?.contributionsCollection?.totalPullRequestReviewContributions ?? 0;
  const discussionComments = user?.repositoryDiscussionComments?.totalCount ?? 0;
  const closedIssues = user?.issues?.totalCount ?? 0;
  
  // Calculate Stars & Top Language
  const repos = user?.repositories?.nodes ?? [];
  const stars = repos.reduce((sum, repo) => sum + (repo?.stargazerCount ?? 0), 0);
  
  // Find Top Language
  const langStats = {};
  repos.forEach(repo => {
    const lang = repo.primaryLanguage?.name;
    if (lang) langStats[lang] = (langStats[lang] || 0) + 1;
  });
  const topLanguage = Object.keys(langStats).sort((a, b) => langStats[b] - langStats[a])[0] || "Polyglot";
  const topLanguageColor = repos.find(r => r.primaryLanguage?.name === topLanguage)?.primaryLanguage?.color || "#586069";

  // Calculate Account Age (XP)
  const createdYear = new Date(user.createdAt).getFullYear();
  const currentYear = new Date().getFullYear();
  const yearsActive = currentYear - createdYear;

  // Impact Score
  const impactScore = Math.floor(
    (reviews * 2) + (discussionComments * 3) + (commits * 0.1) + (stars * 1.5)
  );

  return {
    username: user?.login,
    commits,
    reviews,
    discussionComments,
    closedIssues,
    stars,
    impactScore,
    topLanguage,
    topLanguageColor,
    yearsActive,
    createdYear
  };
}

function generateSVG(metrics) {
  const css = `
    .bg { fill: #1a1b27; }
    .text-hand { font-family: 'Comic Sans MS', 'Chalkboard SE', 'Marker Felt', sans-serif; font-weight: bold; }
    .text-mono { font-family: 'Courier New', Courier, monospace; letter-spacing: -0.5px; }
    .text-bold { font-family: 'Segoe UI', Roboto, sans-serif; font-weight: 900; }
    
    /* Stickies */
    .sticky-yellow { fill: #f1fa8c; filter: drop-shadow(3px 3px 2px rgba(0,0,0,0.3)); }
    .sticky-pink { fill: #ff79c6; filter: drop-shadow(3px 3px 2px rgba(0,0,0,0.3)); }
    
    /* Tape */
    .tape { fill: rgba(255, 255, 255, 0.3); stroke: rgba(255,255,255,0.1); }
    
    /* Coffee Stain */
    .stain { fill: none; stroke: #3e2e22; stroke-width: 4; opacity: 0.4; stroke-dasharray: 100 20; stroke-linecap: round; }
    
    /* Grid */
    .grid { stroke: #2f344d; stroke-width: 1; }
  `;

  return `
    <svg width="800" height="400" viewBox="0 0 800 400" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>${css}</style>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" class="grid"/>
        </pattern>
      </defs>

      <rect width="100%" height="100%" class="bg" />
      <rect width="100%" height="100%" fill="url(#grid)" opacity="0.3"/>
      
      <text x="50%" y="300" text-anchor="middle" fill="#242636" font-size="180" font-weight="900" class="text-bold" transform="rotate(-5, 400, 200)">
        DEV
      </text>

      <g transform="translate(100, 100)">
        <circle cx="0" cy="0" r="70" class="stain" transform="rotate(45)"/>
        <text x="0" y="-10" text-anchor="middle" fill="#6272a4" font-size="12" class="text-bold">ESTABLISHED</text>
        <text x="0" y="20" text-anchor="middle" fill="#6272a4" font-size="30" class="text-bold">${metrics.createdYear}</text>
      </g>

      <g transform="translate(180, 180) rotate(-4)">
        <rect x="0" y="0" width="200" height="160" class="sticky-yellow" />
        <rect x="80" y="-15" width="40" height="25" class="tape" transform="rotate(2)" />
        <text x="20" y="40" font-size="18" fill="#44475a" class="text-hand">Total Commits:</text>
        <text x="100" y="110" font-size="60" text-anchor="middle" fill="#282a36" class="text-hand">${metrics.commits}</text>
      </g>

      <g transform="translate(560, 30) rotate(2)">
        <rect x="0" y="0" width="220" height="340" fill="#f8f8f2" filter="drop-shadow(2px 2px 4px rgba(0,0,0,0.5))" />
        <text x="110" y="30" text-anchor="middle" class="text-mono" font-weight="bold" font-size="14">ACTIVITY.LOG</text>
        <line x1="20" y1="40" x2="200" y2="40" stroke="#444" stroke-dasharray="4" />
        
        <text x="20" y="70" class="text-mono" font-size="12" fill="#282a36">USER: ${metrics.username}</text>
        <text x="20" y="100" class="text-mono" font-size="12" fill="#282a36">REVIEWS ....... ${metrics.reviews}</text>
        <text x="20" y="125" class="text-mono" font-size="12" fill="#282a36">ANSWERS ....... ${metrics.discussionComments}</text>
        <text x="20" y="150" class="text-mono" font-size="12" fill="#282a36">ISSUES ........ ${metrics.closedIssues}</text>
        <text x="20" y="175" class="text-mono" font-size="12" fill="#282a36">STARS ......... ${metrics.stars}</text>
        
        <text x="110" y="220" text-anchor="middle" class="text-mono" font-size="10" fill="#888">VERIFIED BY GITHUB</text>
        <rect x="40" y="240" width="140" height="30" fill="#282a36" />
        
        <rect x="90" y="-10" width="40" height="20" class="tape" />
      </g>

      <g transform="translate(60, 260) rotate(6)">
         <rect x="0" y="0" width="140" height="160" fill="#fff" filter="drop-shadow(2px 2px 3px rgba(0,0,0,0.3))"/>
         <rect x="10" y="10" width="120" height="100" fill="${metrics.topLanguageColor}" opacity="0.8"/>
         <text x="70" y="70" text-anchor="middle" fill="#fff" font-size="14" class="text-bold">FAVORITE</text>
         <text x="70" y="140" text-anchor="middle" fill="#333" font-size="18" class="text-hand">${metrics.topLanguage}</text>
         <rect x="50" y="-10" width="40" height="20" class="tape" />
      </g>

      <g transform="translate(420, 150) rotate(-10)">
        <circle cx="0" cy="0" r="65" fill="none" stroke="#ff5555" stroke-width="4" stroke-dasharray="100 10"/>
        <text x="0" y="-15" text-anchor="middle" font-size="14" fill="#ff5555" class="text-bold">SENIORITY SCORE</text>
        <text x="0" y="30" text-anchor="middle" font-size="55" fill="#ff5555" class="text-bold">${metrics.impactScore}</text>
      </g>
      
      <g transform="translate(350, 40) rotate(-2)">
        <rect x="0" y="0" width="140" height="50" fill="#ffb86c" rx="5" filter="drop-shadow(2px 2px 2px rgba(0,0,0,0.2))" />
        <text x="70" y="32" text-anchor="middle" fill="#282a36" font-size="18" class="text-bold">⚠ SHIPPING</text>
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
