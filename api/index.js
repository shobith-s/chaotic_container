import { fetch } from 'undici';

const GITHUB_API_URL = "https://api.github.com/graphql";

// Enhanced GraphQL query for comprehensive GitHub data
const query = `
  query UserMetrics($login: String!) {
    user(login: $login) {
      login
      name
      createdAt
      avatarUrl
      followers { totalCount }
      following { totalCount }
      gists { totalCount }
      sponsorshipsAsSponsor { totalCount }
      contributionsCollection {
        totalCommitContributions
        totalPullRequestReviewContributions
        contributionCalendar {
          weeks {
            contributionDays {
              contributionCount
              date
              weekday
            }
          }
        }
      }
      repositoryDiscussionComments { totalCount }
      issues(states: CLOSED) { totalCount }
      pullRequests(states: MERGED) { totalCount }
      organizations(first: 10) { totalCount }
      repositoriesContributedTo(first: 3, contributionTypes: [COMMIT, PULL_REQUEST], orderBy: { field: STARGAZERS, direction: DESC }) {
        nodes {
          name
          stargazerCount
        }
      }
      repositories(
        privacy: PUBLIC, ownerAffiliations: OWNER, isFork: false, first: 100, orderBy: { field: STARGAZERS, direction: DESC }
      ) {
        nodes {
          name
          stargazerCount
          forkCount
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

// Seeded random number generator for consistent chaos
function seededRandom(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return function() {
    hash = (hash * 1103515245 + 12345) & 0x7fffffff;
    return (hash % 1000) / 1000;
  };
}

// Calculate streaks from contribution calendar
function calculateStreaks(contributionCalendar) {
  if (!contributionCalendar?.weeks) return { current: 0, longest: 0 };
  
  const allDays = [];
  contributionCalendar.weeks.forEach(week => {
    week.contributionDays.forEach(day => {
      allDays.push({ date: day.date, count: day.contributionCount });
    });
  });
  
  // Sort by date
  allDays.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;
  
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  
  for (let i = 0; i < allDays.length; i++) {
    if (allDays[i].count > 0) {
      tempStreak++;
      longestStreak = Math.max(longestStreak, tempStreak);
    } else {
      tempStreak = 0;
    }
  }
  
  // Calculate current streak (working backwards from today)
  for (let i = allDays.length - 1; i >= 0; i--) {
    const dayDate = allDays[i].date;
    if (dayDate === today || dayDate === yesterday || currentStreak > 0) {
      if (allDays[i].count > 0) {
        currentStreak++;
      } else if (dayDate !== today) {
        break;
      }
    }
  }
  
  return { current: currentStreak, longest: longestStreak };
}

// Calculate most active day of week
function calculateMostActiveDay(contributionCalendar) {
  if (!contributionCalendar?.weeks) return 'Sunday';
  
  const weekdayTotals = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat
  const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  contributionCalendar.weeks.forEach(week => {
    week.contributionDays.forEach(day => {
      weekdayTotals[day.weekday] += day.contributionCount;
    });
  });
  
  const maxIndex = weekdayTotals.indexOf(Math.max(...weekdayTotals));
  return weekdayNames[maxIndex];
}

// Calculate rank based on impact score
function calculateRank(score) {
  if (score > 2000) return { level: "S+", title: "LEGEND" };
  if (score > 1000) return { level: "S", title: "MASTER" };
  if (score > 500) return { level: "A+", title: "SENIOR" };
  if (score > 250) return { level: "A", title: "EXPERT" };
  if (score > 100) return { level: "B", title: "BUILDER" };
  if (score > 50) return { level: "C", title: "CODER" };
  return { level: "D", title: "ROOKIE" };
}

// Determine coding persona based on stats
function determineCodingPersona(metrics) {
  const { reviews, stars, prs, commits, issues, discussions } = metrics;
  
  if (reviews > 100) return "Code Guardian";
  if (stars > 500) return "Star Collector";
  if (prs > 200) return "PR Machine";
  if (commits > 2000) return "Commit Warrior";
  if (issues > 100) return "Issue Hunter";
  if (discussions > 50) return "Community Voice";
  if (reviews > 50) return "Review Master";
  if (stars > 100) return "Rising Star";
  if (prs > 50) return "Merge Master";
  return "Code Explorer";
}

function mapMetrics(user) {
  const commits = user?.contributionsCollection?.totalCommitContributions ?? 0;
  const reviews = user?.contributionsCollection?.totalPullRequestReviewContributions ?? 0;
  const discussions = user?.repositoryDiscussionComments?.totalCount ?? 0;
  const closedIssues = user?.issues?.totalCount ?? 0;
  const prs = user?.pullRequests?.totalCount ?? 0;
  const followers = user?.followers?.totalCount ?? 0;
  const following = user?.following?.totalCount ?? 0;
  const gists = user?.gists?.totalCount ?? 0;
  const sponsorships = user?.sponsorshipsAsSponsor?.totalCount ?? 0;
  const orgs = user?.organizations?.totalCount ?? 0;
  
  const repos = user?.repositories?.nodes ?? [];
  const stars = repos.reduce((sum, repo) => sum + (repo?.stargazerCount ?? 0), 0);
  const forks = repos.reduce((sum, repo) => sum + (repo?.forkCount ?? 0), 0);
  
  // Top repos by stars
  const topRepos = repos
    .filter(r => r && r.name)
    .slice(0, 3)
    .map(r => ({ name: r.name, stars: r.stargazerCount || 0 }));
  
  // Language calculations
  const langCounts = {};
  let totalReposWithLang = 0;
  repos.forEach(repo => { 
    if (repo?.primaryLanguage?.name) {
      const name = repo.primaryLanguage.name;
      const color = repo.primaryLanguage.color;
      if (!langCounts[name]) langCounts[name] = { count: 0, color };
      langCounts[name].count++;
      totalReposWithLang++;
    }
  });

  const topLanguages = Object.entries(langCounts)
    .sort(([,a], [,b]) => b.count - a.count)
    .slice(0, 4)
    .map(([name, data]) => ({
      name,
      color: data.color || "#ccc",
      percent: totalReposWithLang > 0 ? Math.round((data.count / totalReposWithLang) * 100) : 0
    }));

  // Streaks
  const streaks = calculateStreaks(user?.contributionsCollection?.contributionCalendar);
  
  // Most active day
  const mostActiveDay = calculateMostActiveDay(user?.contributionsCollection?.contributionCalendar);
  
  // Account age
  const createdDate = new Date(user?.createdAt);
  const accountAge = Math.floor((Date.now() - createdDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  
  // Impact score (weighted formula)
  const impactScore = Math.floor(
    (reviews * 3) + 
    (discussions * 2) + 
    (commits * 0.1) + 
    (stars * 2) + 
    (prs * 1.5) + 
    (closedIssues * 1)
  );
  
  const rank = calculateRank(impactScore);
  
  const basicMetrics = {
    username: user?.login,
    name: user?.name || user?.login,
    avatar: user?.avatarUrl,
    commits,
    reviews,
    discussions,
    closedIssues,
    prs,
    stars,
    forks,
    followers,
    following,
    gists,
    sponsorships,
    orgs,
    topRepos,
    topLanguages,
    currentStreak: streaks.current,
    longestStreak: streaks.longest,
    mostActiveDay,
    accountAge,
    impactScore,
    rank,
    createdYear: createdDate.getFullYear()
  };
  
  basicMetrics.persona = determineCodingPersona(basicMetrics);
  
  return basicMetrics;
}

// Theme definitions
const themes = {
  default: {
    bg: '#0d1117',
    bgGradient: ['#0d1117', '#161b22'],
    cardBg: '#161b22',
    cardBorder: '#30363d',
    textPrimary: '#c9d1d9',
    textSecondary: '#8b949e',
    accent: '#58a6ff',
    accent2: '#f78166',
    highlight: '#238636',
    glassOpacity: 0.1
  },
  glass: {
    bg: '#1a1a2e',
    bgGradient: ['#1a1a2e', '#16213e'],
    cardBg: 'rgba(255,255,255,0.05)',
    cardBorder: 'rgba(255,255,255,0.1)',
    textPrimary: '#ffffff',
    textSecondary: '#a0a0a0',
    accent: '#00d9ff',
    accent2: '#ff6b9d',
    highlight: '#00ff88',
    glassOpacity: 0.15
  },
  snow_globe: {
    bg: '#1e3a5f',
    bgGradient: ['#1e3a5f', '#0c2340'],
    cardBg: '#234b7a',
    cardBorder: '#5ca0d3',
    textPrimary: '#e8f4f8',
    textSecondary: '#a8d4e6',
    accent: '#87ceeb',
    accent2: '#ffffff',
    highlight: '#5ca0d3',
    glassOpacity: 0.2
  },
  lava_lamp: {
    bg: '#1a0a0a',
    bgGradient: ['#1a0a0a', '#2d1f1f'],
    cardBg: '#3d1f1f',
    cardBorder: '#ff6b35',
    textPrimary: '#ffeedd',
    textSecondary: '#ffaa88',
    accent: '#ff6b35',
    accent2: '#ff9f1c',
    highlight: '#ff4444',
    glassOpacity: 0.15
  },
  matrix: {
    bg: '#0a0a0a',
    bgGradient: ['#0a0a0a', '#0d1a0d'],
    cardBg: '#0d1a0d',
    cardBorder: '#00ff00',
    textPrimary: '#00ff00',
    textSecondary: '#008800',
    accent: '#00ff00',
    accent2: '#88ff88',
    highlight: '#00ff00',
    glassOpacity: 0.1
  },
  dracula: {
    bg: '#282a36',
    bgGradient: ['#282a36', '#1e1f29'],
    cardBg: '#44475a',
    cardBorder: '#6272a4',
    textPrimary: '#f8f8f2',
    textSecondary: '#6272a4',
    accent: '#bd93f9',
    accent2: '#ff79c6',
    highlight: '#50fa7b',
    glassOpacity: 0.1
  },
  nord: {
    bg: '#2e3440',
    bgGradient: ['#2e3440', '#3b4252'],
    cardBg: '#3b4252',
    cardBorder: '#4c566a',
    textPrimary: '#eceff4',
    textSecondary: '#d8dee9',
    accent: '#88c0d0',
    accent2: '#81a1c1',
    highlight: '#a3be8c',
    glassOpacity: 0.1
  },
  cyberpunk: {
    bg: '#0a0a1a',
    bgGradient: ['#0a0a1a', '#1a0a2a'],
    cardBg: '#1a1a3a',
    cardBorder: '#ff00ff',
    textPrimary: '#00ffff',
    textSecondary: '#ff00ff',
    accent: '#00ffff',
    accent2: '#ff00ff',
    highlight: '#ffff00',
    glassOpacity: 0.15
  }
};

// SVG Icon definitions (minimalist stroke-based, 2px stroke)
const iconDefs = `
  <symbol id="icon-flame" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2c0 4-3 6-3 10a5 5 0 1 0 10 0c0-4-3-6-3-10"/>
    <path d="M12 14a2 2 0 0 0-2 2c0 1.1.9 2 2 2s2-.9 2-2a2 2 0 0 0-2-2z"/>
  </symbol>
  <symbol id="icon-trophy" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
    <path d="M4 22h16"/>
    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
  </symbol>
  <symbol id="icon-star" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </symbol>
  <symbol id="icon-git-pr" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="18" cy="18" r="3"/>
    <circle cx="6" cy="6" r="3"/>
    <path d="M13 6h3a2 2 0 0 1 2 2v7"/>
    <line x1="6" y1="9" x2="6" y2="21"/>
  </symbol>
  <symbol id="icon-git-commit" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <line x1="3" y1="12" x2="9" y2="12"/>
    <line x1="15" y1="12" x2="21" y2="12"/>
  </symbol>
  <symbol id="icon-git-fork" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="18" r="3"/>
    <circle cx="6" cy="6" r="3"/>
    <circle cx="18" cy="6" r="3"/>
    <path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9"/>
    <path d="M12 12v3"/>
  </symbol>
  <symbol id="icon-eye" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
    <circle cx="12" cy="12" r="3"/>
  </symbol>
  <symbol id="icon-check-circle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <polyline points="22 4 12 14.01 9 11.01"/>
  </symbol>
  <symbol id="icon-bolt" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </symbol>
  <symbol id="icon-users" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </symbol>
  <symbol id="icon-calendar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </symbol>
  <symbol id="icon-code" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="16 18 22 12 16 6"/>
    <polyline points="8 6 2 12 8 18"/>
  </symbol>
  <symbol id="icon-book" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
  </symbol>
  <symbol id="icon-chat" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </symbol>
  <symbol id="icon-heart" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
  </symbol>
  <symbol id="icon-shield" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </symbol>
  <symbol id="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="4"/>
    <path d="M12 2v2"/>
    <path d="M12 20v2"/>
    <path d="m4.93 4.93 1.41 1.41"/>
    <path d="m17.66 17.66 1.41 1.41"/>
    <path d="M2 12h2"/>
    <path d="M20 12h2"/>
    <path d="m6.34 17.66-1.41 1.41"/>
    <path d="m19.07 4.93-1.41 1.41"/>
  </symbol>
  <symbol id="icon-file" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
    <polyline points="14 2 14 8 20 8"/>
  </symbol>
`;

function generateSVG(metrics, themeName = 'default', chaosLevel = 5) {
  const theme = themes[themeName] || themes.default;
  const random = seededRandom(metrics.username + chaosLevel);
  
  // Chaos rotation helper
  const chaosRotation = () => (random() - 0.5) * chaosLevel * 4;
  const chaosOffset = () => (random() - 0.5) * chaosLevel * 3;
  
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&amp;family=Inter:wght@400;600;700&amp;display=swap');
    .bg { fill: url(#bgGradient); }
    .text-main { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
    .text-mono { font-family: 'JetBrains Mono', 'Courier New', monospace; }
    .card { fill: ${theme.cardBg}; stroke: ${theme.cardBorder}; stroke-width: 1; }
    .card-glass { fill: ${theme.cardBg}; stroke: ${theme.cardBorder}; stroke-width: 1; filter: url(#glow); }
    .text-primary { fill: ${theme.textPrimary}; }
    .text-secondary { fill: ${theme.textSecondary}; }
    .text-accent { fill: ${theme.accent}; }
    .text-accent2 { fill: ${theme.accent2}; }
    .text-highlight { fill: ${theme.highlight}; }
    .icon { stroke: ${theme.accent}; }
    .icon-secondary { stroke: ${theme.textSecondary}; }
    .cuboid-edge { stroke: ${theme.cardBorder}; stroke-width: 2; fill: none; }
    .cuboid-face { fill: ${theme.cardBg}; opacity: ${theme.glassOpacity}; }
    .grid-line { stroke: ${theme.cardBorder}; stroke-width: 0.5; opacity: 0.3; }
  `;

  // Generate floating cards with chaos
  const generateFloatingCard = (x, y, width, height, rotation, content, title, iconId) => `
    <g transform="translate(${x + chaosOffset()}, ${y + chaosOffset()}) rotate(${rotation + chaosRotation()}, ${width/2}, ${height/2})">
      <rect x="0" y="0" width="${width}" height="${height}" rx="8" class="card-glass"/>
      <rect x="0" y="0" width="${width}" height="28" rx="8" fill="${theme.cardBorder}" opacity="0.5"/>
      <rect x="0" y="14" width="${width}" height="14" fill="${theme.cardBorder}" opacity="0.5"/>
      <use href="#${iconId}" x="8" y="6" width="16" height="16" class="icon"/>
      <text x="28" y="19" class="text-main text-primary" font-size="11" font-weight="600">${title}</text>
      ${content}
    </g>
  `;

  // Identity card content
  const identityContent = `
    <text x="${60}" y="55" class="text-mono text-accent" font-size="14" font-weight="700" text-anchor="middle">@${metrics.username}</text>
    <text x="${60}" y="75" class="text-main text-secondary" font-size="10" text-anchor="middle">${metrics.persona}</text>
    <text x="${60}" y="100" class="text-mono text-highlight" font-size="24" font-weight="700" text-anchor="middle">${metrics.rank.level}</text>
    <text x="${60}" y="115" class="text-main text-secondary" font-size="9" text-anchor="middle">${metrics.rank.title}</text>
    ${metrics.sponsorships > 0 ? `<use href="#icon-heart" x="50" y="120" width="20" height="20" style="stroke: ${theme.accent2};"/>` : ''}
  `;

  // Streaks card content
  const streaksContent = `
    <g transform="translate(10, 40)">
      <use href="#icon-flame" x="0" y="0" width="18" height="18" style="stroke: ${theme.accent2};"/>
      <text x="24" y="14" class="text-main text-primary" font-size="10">Current</text>
      <text x="90" y="14" class="text-mono text-accent2" font-size="12" font-weight="700" text-anchor="end">${metrics.currentStreak}d</text>
    </g>
    <g transform="translate(10, 65)">
      <use href="#icon-trophy" x="0" y="0" width="18" height="18" style="stroke: ${theme.highlight};"/>
      <text x="24" y="14" class="text-main text-primary" font-size="10">Longest</text>
      <text x="90" y="14" class="text-mono text-highlight" font-size="12" font-weight="700" text-anchor="end">${metrics.longestStreak}d</text>
    </g>
  `;

  // Core stats card content
  const coreStatsContent = `
    <g transform="translate(10, 40)">
      <use href="#icon-git-commit" x="0" y="0" width="14" height="14" class="icon-secondary"/>
      <text x="18" y="11" class="text-main text-secondary" font-size="9">Commits</text>
      <text x="95" y="11" class="text-mono text-primary" font-size="10" text-anchor="end">${metrics.commits}</text>
    </g>
    <g transform="translate(10, 58)">
      <use href="#icon-git-pr" x="0" y="0" width="14" height="14" class="icon-secondary"/>
      <text x="18" y="11" class="text-main text-secondary" font-size="9">PRs Merged</text>
      <text x="95" y="11" class="text-mono text-primary" font-size="10" text-anchor="end">${metrics.prs}</text>
    </g>
    <g transform="translate(10, 76)">
      <use href="#icon-eye" x="0" y="0" width="14" height="14" class="icon-secondary"/>
      <text x="18" y="11" class="text-main text-secondary" font-size="9">Reviews</text>
      <text x="95" y="11" class="text-mono text-primary" font-size="10" text-anchor="end">${metrics.reviews}</text>
    </g>
    <g transform="translate(10, 94)">
      <use href="#icon-check-circle" x="0" y="0" width="14" height="14" class="icon-secondary"/>
      <text x="18" y="11" class="text-main text-secondary" font-size="9">Issues</text>
      <text x="95" y="11" class="text-mono text-primary" font-size="10" text-anchor="end">${metrics.closedIssues}</text>
    </g>
    <g transform="translate(10, 112)">
      <use href="#icon-star" x="0" y="0" width="14" height="14" class="icon-secondary"/>
      <text x="18" y="11" class="text-main text-secondary" font-size="9">Stars</text>
      <text x="95" y="11" class="text-mono text-primary" font-size="10" text-anchor="end">${metrics.stars}</text>
    </g>
    <g transform="translate(10, 130)">
      <use href="#icon-git-fork" x="0" y="0" width="14" height="14" class="icon-secondary"/>
      <text x="18" y="11" class="text-main text-secondary" font-size="9">Forks</text>
      <text x="95" y="11" class="text-mono text-primary" font-size="10" text-anchor="end">${metrics.forks}</text>
    </g>
  `;

  // Languages card content
  const langBars = metrics.topLanguages.map((lang, i) => `
    <g transform="translate(10, ${40 + i * 22})">
      <circle cx="6" cy="6" r="5" fill="${lang.color}" stroke="${theme.textPrimary}" stroke-width="1"/>
      <text x="16" y="10" class="text-main text-primary" font-size="9">${lang.name}</text>
      <text x="95" y="10" class="text-mono text-secondary" font-size="8" text-anchor="end">${lang.percent}%</text>
    </g>
  `).join('');

  const languagesContent = langBars || `<text x="10" y="50" class="text-main text-secondary" font-size="9">No languages found</text>`;

  // Top repos card content
  const repoItems = metrics.topRepos.map((repo, i) => `
    <g transform="translate(10, ${40 + i * 22})">
      <use href="#icon-book" x="0" y="0" width="14" height="14" class="icon-secondary"/>
      <text x="18" y="11" class="text-main text-primary" font-size="9">${repo.name.substring(0, 12)}${repo.name.length > 12 ? '...' : ''}</text>
      <use href="#icon-star" x="80" y="0" width="12" height="12" style="stroke: ${theme.accent2};"/>
      <text x="95" y="11" class="text-mono text-accent2" font-size="8">${repo.stars}</text>
    </g>
  `).join('');

  const reposContent = repoItems || `<text x="10" y="50" class="text-main text-secondary" font-size="9">No repos found</text>`;

  // Social card content
  const socialContent = `
    <g transform="translate(10, 40)">
      <use href="#icon-users" x="0" y="0" width="14" height="14" class="icon-secondary"/>
      <text x="18" y="11" class="text-main text-secondary" font-size="9">Followers</text>
      <text x="85" y="11" class="text-mono text-primary" font-size="10" text-anchor="end">${metrics.followers}</text>
    </g>
    <g transform="translate(10, 58)">
      <use href="#icon-chat" x="0" y="0" width="14" height="14" class="icon-secondary"/>
      <text x="18" y="11" class="text-main text-secondary" font-size="9">Discussions</text>
      <text x="85" y="11" class="text-mono text-primary" font-size="10" text-anchor="end">${metrics.discussions}</text>
    </g>
    <g transform="translate(10, 76)">
      <use href="#icon-file" x="0" y="0" width="14" height="14" class="icon-secondary"/>
      <text x="18" y="11" class="text-main text-secondary" font-size="9">Gists</text>
      <text x="85" y="11" class="text-mono text-primary" font-size="10" text-anchor="end">${metrics.gists}</text>
    </g>
  `;

  // Impact score card content
  const impactContent = `
    <text x="50" y="65" class="text-mono text-accent" font-size="32" font-weight="700" text-anchor="middle">${metrics.impactScore}</text>
    <text x="50" y="85" class="text-main text-secondary" font-size="9" text-anchor="middle">Impact Score</text>
  `;

  // Activity card content
  const activityContent = `
    <g transform="translate(10, 40)">
      <use href="#icon-sun" x="0" y="0" width="14" height="14" class="icon-secondary"/>
      <text x="18" y="11" class="text-main text-secondary" font-size="9">Most Active</text>
      <text x="85" y="11" class="text-mono text-primary" font-size="9" text-anchor="end">${metrics.mostActiveDay.substring(0, 3)}</text>
    </g>
    <g transform="translate(10, 58)">
      <use href="#icon-calendar" x="0" y="0" width="14" height="14" class="icon-secondary"/>
      <text x="18" y="11" class="text-main text-secondary" font-size="9">Account Age</text>
      <text x="85" y="11" class="text-mono text-primary" font-size="9" text-anchor="end">${metrics.accountAge}y</text>
    </g>
  `;

  // 3D Cuboid container paths (isometric projection)
  const cuboidPaths = `
    <!-- Back face -->
    <path d="M 100 80 L 800 80 L 800 370 L 100 370 Z" class="cuboid-face"/>
    <!-- Left face -->
    <path d="M 50 100 L 100 80 L 100 370 L 50 390 Z" class="cuboid-face"/>
    <!-- Bottom face -->
    <path d="M 50 390 L 100 370 L 800 370 L 850 390 Z" class="cuboid-face"/>
    <!-- Right face -->
    <path d="M 800 80 L 850 100 L 850 390 L 800 370 Z" class="cuboid-face"/>
    <!-- Top face -->
    <path d="M 50 100 L 100 80 L 800 80 L 850 100 Z" class="cuboid-face"/>
    
    <!-- Grid pattern on back face -->
    ${Array.from({length: 8}, (_, i) => `<line x1="${100 + i * 87.5}" y1="80" x2="${100 + i * 87.5}" y2="370" class="grid-line"/>`).join('')}
    ${Array.from({length: 5}, (_, i) => `<line x1="100" y1="${80 + i * 72.5}" x2="800" y2="${80 + i * 72.5}" class="grid-line"/>`).join('')}
    
    <!-- Edges (glass highlight effect) -->
    <path d="M 50 100 L 100 80 L 800 80 L 850 100" class="cuboid-edge" stroke-opacity="0.6"/>
    <path d="M 50 100 L 50 390 L 100 370" class="cuboid-edge" stroke-opacity="0.4"/>
    <path d="M 850 100 L 850 390 L 800 370" class="cuboid-edge" stroke-opacity="0.4"/>
    <path d="M 50 390 L 850 390" class="cuboid-edge" stroke-opacity="0.3"/>
  `;

  return `<svg width="900" height="450" viewBox="0 0 900 450" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>${css}</style>
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${theme.bgGradient[0]}"/>
      <stop offset="100%" style="stop-color:${theme.bgGradient[1]}"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="1" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    ${iconDefs}
  </defs>

  <!-- Background -->
  <rect width="100%" height="100%" class="bg"/>
  
  <!-- 3D Cuboid Container -->
  ${cuboidPaths}
  
  <!-- Floating Cards Inside Container -->
  
  <!-- Identity Card -->
  ${generateFloatingCard(115, 95, 120, 140, -2, identityContent, 'Identity', 'icon-shield')}
  
  <!-- Streaks Card -->
  ${generateFloatingCard(250, 100, 110, 95, 3, streaksContent, 'Streaks', 'icon-flame')}
  
  <!-- Core Stats Card -->
  ${generateFloatingCard(375, 90, 115, 155, -1, coreStatsContent, 'Stats', 'icon-git-commit')}
  
  <!-- Languages Card -->
  ${generateFloatingCard(115, 250, 110, 115, 4, languagesContent, 'Languages', 'icon-code')}
  
  <!-- Top Repos Card -->
  ${generateFloatingCard(240, 210, 115, 105, -3, reposContent, 'Top Repos', 'icon-book')}
  
  <!-- Social Card -->
  ${generateFloatingCard(370, 260, 100, 100, 2, socialContent, 'Social', 'icon-users')}
  
  <!-- Impact Score Card -->
  ${generateFloatingCard(505, 95, 100, 100, -4, impactContent, 'Impact', 'icon-bolt')}
  
  <!-- Activity Card -->
  ${generateFloatingCard(505, 210, 100, 85, 3, activityContent, 'Activity', 'icon-sun')}
  
  <!-- Title watermark -->
  <text x="750" y="420" class="text-mono text-secondary" font-size="10" opacity="0.5">Chaos Contained</text>
  
</svg>`;
}

// Generate error SVG
function generateErrorSVG(message, theme = themes.default) {
  return `<svg width="900" height="450" viewBox="0 0 900 450" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${theme.bgGradient[0]}"/>
      <stop offset="100%" style="stop-color:${theme.bgGradient[1]}"/>
    </linearGradient>
    ${iconDefs}
  </defs>
  <rect width="100%" height="100%" fill="${theme.bg}"/>
  <g transform="translate(450, 200)">
    <use href="#icon-shield" x="-30" y="-60" width="60" height="60" stroke="${theme.accent2}" fill="none" stroke-width="2"/>
    <text x="0" y="20" text-anchor="middle" fill="${theme.textPrimary}" font-family="Inter, sans-serif" font-size="18" font-weight="600">Error</text>
    <text x="0" y="50" text-anchor="middle" fill="${theme.textSecondary}" font-family="JetBrains Mono, monospace" font-size="12">${message}</text>
  </g>
  <text x="750" y="420" fill="${theme.textSecondary}" font-family="JetBrains Mono, monospace" font-size="10" opacity="0.5">Chaos Contained</text>
</svg>`;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.GH_TOKEN;
  const username = req.query?.username;
  const themeName = req.query?.theme || 'default';
  const chaosLevel = Math.min(10, Math.max(0, parseInt(req.query?.chaos) || 5));
  
  const theme = themes[themeName] || themes.default;

  // Error: Missing GH_TOKEN
  if (!token) {
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "no-cache");
    return res.status(500).send(generateErrorSVG("Server missing GH_TOKEN environment variable", theme));
  }

  // Error: Missing username
  if (!username) {
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "no-cache");
    return res.status(400).send(generateErrorSVG("Missing required parameter: username", theme));
  }

  try {
    const data = await fetchGitHubData(token, username);
    
    if (!data?.user) {
      res.setHeader("Content-Type", "image/svg+xml");
      res.setHeader("Cache-Control", "no-cache");
      return res.status(404).send(generateErrorSVG(`User not found: ${username}`, theme));
    }

    const metrics = mapMetrics(data.user);
    const svg = generateSVG(metrics, themeName, chaosLevel);

    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "public, max-age=14400, s-maxage=14400");
    res.status(200).send(svg);

  } catch (error) {
    console.error(error);
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "no-cache");
    res.status(500).send(generateErrorSVG(`API Error: ${error.message.substring(0, 50)}`, theme));
  }
}
