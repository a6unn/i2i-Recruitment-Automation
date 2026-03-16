import type { ParsedJD, ScrapedProfile, AlgorithmicScoreBreakdown, ScoringTier, ScoringConfig } from '@recruitment/shared';

// === Fallback Config (used when no dynamic config available) ===

const FALLBACK_CONFIG: ScoringConfig = {
  skillSynonymGroups: [
    ['react', 'reactjs', 'react.js', 'react js'],
    ['node.js', 'node', 'nodejs', 'node js'],
    ['javascript', 'js', 'es6', 'ecmascript'],
    ['typescript', 'ts'],
    ['python', 'py', 'python3', 'python 3'],
    ['go', 'golang', 'go lang'],
    ['aws', 'amazon web services', 'amazon webservices'],
    ['kubernetes', 'k8s', 'k8'],
    ['postgres', 'postgresql', 'psql'],
    ['mongodb', 'mongo', 'mongo db'],
    ['docker', 'docker container', 'containerization'],
    ['.net', 'dotnet', 'dot net', '.net core', 'asp.net'],
    ['csharp', 'c#', 'c sharp'],
    ['cicd', 'ci/cd', 'ci cd', 'continuous integration'],
    ['spark', 'pyspark', 'apache spark'],
    ['html', 'html5', 'html/css'],
    ['css', 'css3'],
    ['git', 'github', 'gitlab', 'bitbucket'],
    ['sql', 'mysql', 'my sql'],
    ['sql server', 'mssql', 'ms sql'],
    ['rest', 'rest api', 'restful', 'restful api'],
    ['machine learning', 'ml'],
    ['deep learning', 'dl'],
    ['angular', 'angularjs', 'angular js'],
    ['vue.js', 'vue', 'vuejs'],
    ['next.js', 'nextjs', 'next js'],
    ['express.js', 'express', 'expressjs'],
    ['spring boot', 'springboot'],
    ['redis', 'redis cache'],
    ['elasticsearch', 'elastic search'],
    ['microservices', 'microservice', 'micro service', 'micro services'],
    ['linux', 'unix', 'ubuntu', 'centos'],
    ['bash', 'shell scripting', 'shell'],
    ['react native', 'rn'],
    ['rails', 'ruby on rails', 'ror'],
    ['kafka', 'apache kafka'],
    ['airflow', 'apache airflow'],
    ['terraform', 'tf'],
    ['graphql', 'graph ql'],
    ['tailwind css', 'tailwind', 'tailwindcss'],
    ['sass', 'scss'],
    ['google cloud', 'gcp', 'google cloud platform'],
    ['lambda', 'aws lambda'],
    ['sklearn', 'scikit-learn', 'scikit learn'],
    ['tensorflow', 'tf framework'],
    ['power bi', 'powerbi'],
    ['bigquery', 'big query'],
    ['salesforce', 'sfdc'],
    ['new relic', 'newrelic'],
    ['elk stack', 'elk'],
    ['azure devops', 'ado'],
  ],
  locationAliasGroups: [
    ['bangalore', 'bengaluru', 'blr'],
    ['mumbai', 'bombay'],
    ['delhi', 'new delhi'],
    ['gurgaon', 'gurugram'],
    ['noida', 'greater noida'],
    ['hyderabad', 'secunderabad'],
    ['chennai', 'madras'],
    ['pune', 'poona'],
    ['kolkata', 'calcutta'],
  ],
  regionGroups: {
    'ncr': ['delhi', 'new delhi', 'gurgaon', 'gurugram', 'noida', 'greater noida', 'faridabad', 'ghaziabad'],
    'mmr': ['mumbai', 'bombay', 'navi mumbai', 'thane'],
  },
  educationGroups: [
    ['bachelors', 'b.tech', 'btech', 'b tech', 'b.e.', 'b.e', 'be', 'b.sc', 'bsc', 'b.s.', 'bs', 'bca', 'b.c.a', 'bba', 'b.com', 'bachelor', "bachelor's", 'undergraduate', 'ug'],
    ['masters', 'm.tech', 'mtech', 'm tech', 'm.e.', 'm.e', 'me', 'm.sc', 'msc', 'm.s.', 'ms', 'mca', 'm.c.a', 'mba', 'm.b.a', 'pgdm', 'pg', 'master', "master's", 'postgraduate', 'post graduate'],
    ['doctorate', 'phd', 'ph.d', 'ph.d.', 'doctoral'],
    ['diploma', 'polytechnic', 'iti'],
  ],
};

const DEGREE_HIERARCHY: Record<string, number> = {
  'doctorate': 4,
  'masters': 3,
  'bachelors': 2,
  'diploma': 1,
};

const DEFAULT_WEIGHTS = { skill: 0.45, experience: 0.30, location: 0.10, education: 0.15 };

// === Lookup Map Builder ===

interface LookupMaps {
  skillMap: Record<string, string>;
  cityMap: Record<string, string>;
  regionGroups: Record<string, string[]>;
  degreeMap: Record<string, string>;
}

function buildLookupMaps(config: ScoringConfig): LookupMaps {
  const skillMap: Record<string, string> = {};
  for (const group of config.skillSynonymGroups) {
    if (group.length === 0) continue;
    const canonical = group[0].toLowerCase();
    for (const variant of group) {
      skillMap[variant.toLowerCase()] = canonical;
    }
  }

  const cityMap: Record<string, string> = {};
  for (const group of config.locationAliasGroups) {
    if (group.length === 0) continue;
    const canonical = group[0].toLowerCase();
    for (const variant of group) {
      cityMap[variant.toLowerCase()] = canonical;
    }
  }

  const regionGroups: Record<string, string[]> = {};
  for (const [region, cities] of Object.entries(config.regionGroups)) {
    regionGroups[region.toLowerCase()] = cities.map(c => c.toLowerCase());
  }

  const degreeMap: Record<string, string> = {};
  for (const group of config.educationGroups) {
    if (group.length === 0) continue;
    const level = group[0].toLowerCase();
    for (const variant of group) {
      degreeMap[variant.toLowerCase()] = level;
    }
  }

  return { skillMap, cityMap, regionGroups, degreeMap };
}

function mergeConfigs(dynamic: ScoringConfig | undefined, fallback: ScoringConfig): ScoringConfig {
  if (!dynamic) return fallback;

  // Build sets of canonical names from dynamic config for dedup
  const dynamicSkillCanonicals = new Set(dynamic.skillSynonymGroups.map(g => g[0]?.toLowerCase()));
  const dynamicCityCanonicals = new Set(dynamic.locationAliasGroups.map(g => g[0]?.toLowerCase()));
  const dynamicEduCanonicals = new Set(dynamic.educationGroups.map(g => g[0]?.toLowerCase()));

  return {
    skillSynonymGroups: [
      ...dynamic.skillSynonymGroups,
      ...fallback.skillSynonymGroups.filter(g => !dynamicSkillCanonicals.has(g[0]?.toLowerCase())),
    ],
    locationAliasGroups: [
      ...dynamic.locationAliasGroups,
      ...fallback.locationAliasGroups.filter(g => !dynamicCityCanonicals.has(g[0]?.toLowerCase())),
    ],
    regionGroups: { ...fallback.regionGroups, ...dynamic.regionGroups },
    educationGroups: [
      ...dynamic.educationGroups,
      ...fallback.educationGroups.filter(g => !dynamicEduCanonicals.has(g[0]?.toLowerCase())),
    ],
    weights: dynamic.weights,
  };
}

// === Core Functions ===

function normalizeSkill(skill: string, skillMap: Record<string, string>): string {
  const lower = skill.toLowerCase().trim();
  return skillMap[lower] || lower;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

function fuzzySkillMatch(jdSkill: string, candidateSkills: string[], skillMap: Record<string, string>): boolean {
  const normalizedJD = normalizeSkill(jdSkill, skillMap);
  const maxDist = normalizedJD.length <= 5 ? 1 : normalizedJD.length <= 8 ? 2 : 3;

  for (const cs of candidateSkills) {
    const normalizedCS = normalizeSkill(cs, skillMap);

    // Exact match after normalization
    if (normalizedJD === normalizedCS) return true;

    // Substring match
    if (normalizedCS.includes(normalizedJD) || normalizedJD.includes(normalizedCS)) return true;

    // Fuzzy match (Levenshtein)
    if (levenshtein(normalizedJD, normalizedCS) <= maxDist) return true;
  }
  return false;
}

function scoreSkills(
  mustHave: string[],
  niceToHave: string[],
  candidateSkills: string[],
  skillMap: Record<string, string>
): { score: number; hits: string[]; misses: string[]; niceToHaveHits: string[] } {
  if (mustHave.length === 0) {
    return { score: 80, hits: [], misses: [], niceToHaveHits: [] };
  }

  const hits: string[] = [];
  const misses: string[] = [];
  for (const skill of mustHave) {
    if (fuzzySkillMatch(skill, candidateSkills, skillMap)) {
      hits.push(skill);
    } else {
      misses.push(skill);
    }
  }

  const niceToHaveHits: string[] = [];
  for (const skill of niceToHave) {
    if (fuzzySkillMatch(skill, candidateSkills, skillMap)) {
      niceToHaveHits.push(skill);
    }
  }

  // Base score from must-haves
  const mustHaveRatio = hits.length / mustHave.length;
  let score = mustHaveRatio * 100;

  // Heavy penalty for missing must-haves: each miss costs extra
  const missPenalty = misses.length * (100 / mustHave.length) * 0.3;
  score = Math.max(0, score - missPenalty);

  // Nice-to-have bonus (up to +15)
  if (niceToHave.length > 0) {
    const niceBonus = (niceToHaveHits.length / niceToHave.length) * 15;
    score = Math.min(100, score + niceBonus);
  }

  return { score: Math.round(score), hits, misses, niceToHaveHits };
}

export function parseExperience(expString: string | undefined): number | null {
  if (!expString) return null;

  const lower = expString.toLowerCase().trim();

  // "8y 0m", "7y 5m"
  const ymMatch = lower.match(/(\d+)\s*y(?:ears?|r)?\s*(\d+)?\s*m?/);
  if (ymMatch) {
    const years = parseInt(ymMatch[1], 10);
    const months = ymMatch[2] ? parseInt(ymMatch[2], 10) : 0;
    return Math.round((years + months / 12) * 100) / 100;
  }

  // "10+ years", "10 years"
  const yearsMatch = lower.match(/(\d+)\+?\s*(?:years?|yrs?)/);
  if (yearsMatch) {
    return parseInt(yearsMatch[1], 10);
  }

  // Just a number
  const numMatch = lower.match(/^(\d+(?:\.\d+)?)$/);
  if (numMatch) {
    return parseFloat(numMatch[1]);
  }

  return null;
}

function scoreExperience(
  candidateExp: string | undefined,
  jdRange: { min: number; max: number }
): { score: number; parsed: number | null } {
  const parsed = parseExperience(candidateExp);

  if (parsed === null) {
    return { score: 50, parsed: null }; // Unknown → middle score
  }

  const { min, max } = jdRange;

  // Within range
  if (parsed >= min && parsed <= max) {
    return { score: 100, parsed };
  }

  // Below range
  if (parsed < min) {
    const deficit = min - parsed;
    const penalty = deficit * 15;
    return { score: Math.max(20, 100 - penalty), parsed };
  }

  // Above range (penalized less)
  const excess = parsed - max;
  const penalty = excess * 5;
  return { score: Math.max(60, 100 - penalty), parsed };
}

function normalizeCity(city: string, cityMap: Record<string, string>): string {
  const lower = city.toLowerCase().trim();

  // Check lookup map
  if (cityMap[lower]) return cityMap[lower];

  // Check if any alias is a substring
  for (const [alias, canonical] of Object.entries(cityMap)) {
    if (lower.includes(alias)) return canonical;
  }

  return lower;
}

function scoreLocation(
  candidateLocation: string | undefined,
  jdLocations: string[],
  cityMap: Record<string, string>,
  regionGroups: Record<string, string[]>
): { score: number; match: 'exact' | 'region' | 'none' | 'not_required' } {
  if (!jdLocations.length) {
    return { score: 100, match: 'not_required' };
  }

  if (!candidateLocation) {
    return { score: 40, match: 'none' };
  }

  const candidateNorm = normalizeCity(candidateLocation, cityMap);
  const candidateLower = candidateLocation.toLowerCase().trim();

  // Check exact city match
  for (const jdLoc of jdLocations) {
    const jdNorm = normalizeCity(jdLoc, cityMap);
    if (candidateNorm === jdNorm) {
      return { score: 100, match: 'exact' };
    }
  }

  // Check region match
  for (const jdLoc of jdLocations) {
    const jdLower = jdLoc.toLowerCase().trim();

    for (const [, cities] of Object.entries(regionGroups)) {
      const candidateInRegion = cities.some(c => candidateLower.includes(c) || candidateNorm === c);
      const jdInRegion = cities.some(c => jdLower.includes(c) || normalizeCity(jdLoc, cityMap) === c);

      if (candidateInRegion && jdInRegion) {
        return { score: 60, match: 'region' };
      }
    }
  }

  // Check if JD mentions "remote" or "anywhere"
  for (const jdLoc of jdLocations) {
    const jdLower = jdLoc.toLowerCase();
    if (jdLower.includes('remote') || jdLower.includes('anywhere') || jdLower.includes('pan india')) {
      return { score: 100, match: 'exact' };
    }
  }

  return { score: 20, match: 'none' };
}

function parseDegreeLevel(education: string, degreeMap: Record<string, string>): string | null {
  const lower = education.toLowerCase().trim();

  // Check each known degree keyword
  for (const [keyword, level] of Object.entries(degreeMap)) {
    if (lower.includes(keyword)) return level;
  }

  return null;
}

function scoreEducation(
  candidateEducation: string | undefined,
  jdEducation: string[],
  degreeMap: Record<string, string>
): { score: number; match: 'meets' | 'below' | 'above' | 'unknown' } {
  if (!jdEducation.length) {
    return { score: 100, match: 'meets' };
  }

  if (!candidateEducation) {
    return { score: 50, match: 'unknown' };
  }

  const candidateLevel = parseDegreeLevel(candidateEducation, degreeMap);
  if (!candidateLevel) {
    return { score: 50, match: 'unknown' };
  }

  // Find highest required level
  let maxRequiredLevel = 0;
  for (const req of jdEducation) {
    const level = parseDegreeLevel(req, degreeMap);
    if (level && (DEGREE_HIERARCHY[level] || 0) > maxRequiredLevel) {
      maxRequiredLevel = DEGREE_HIERARCHY[level] || 0;
    }
  }

  if (maxRequiredLevel === 0) {
    return { score: 100, match: 'meets' };
  }

  const candidateHierarchy = DEGREE_HIERARCHY[candidateLevel] || 0;

  if (candidateHierarchy >= maxRequiredLevel) {
    return { score: 100, match: candidateHierarchy > maxRequiredLevel ? 'above' : 'meets' };
  }

  // One level below
  if (candidateHierarchy === maxRequiredLevel - 1) {
    return { score: 60, match: 'below' };
  }

  return { score: 30, match: 'below' };
}

// === Main Scoring Function ===

export function scoreProfileAlgorithmically(
  profile: ScrapedProfile,
  parsedJD: ParsedJD,
  lookupMaps: LookupMaps,
  weights = DEFAULT_WEIGHTS
): AlgorithmicScoreBreakdown {
  const skills = scoreSkills(
    parsedJD.mustHaveSkills,
    parsedJD.niceToHaveSkills,
    profile.skills,
    lookupMaps.skillMap
  );

  const experience = scoreExperience(
    profile.totalExperience,
    parsedJD.experienceRange
  );

  const location = scoreLocation(
    profile.location,
    parsedJD.locations,
    lookupMaps.cityMap,
    lookupMaps.regionGroups
  );

  const education = scoreEducation(
    profile.education,
    parsedJD.education,
    lookupMaps.degreeMap
  );

  const totalScore = Math.round(
    skills.score * weights.skill +
    experience.score * weights.experience +
    location.score * weights.location +
    education.score * weights.education
  );

  return {
    skillScore: skills.score,
    experienceScore: experience.score,
    locationScore: location.score,
    educationScore: education.score,
    totalScore,
    skillHits: skills.hits,
    skillMisses: skills.misses,
    niceToHaveHits: skills.niceToHaveHits,
    experienceParsed: experience.parsed,
    experienceRange: parsedJD.experienceRange,
    locationMatch: location.match,
    educationMatch: education.match,
  };
}

export function determineTier(algoScore: number): ScoringTier {
  if (algoScore >= 85) return 'confirm';
  if (algoScore >= 50) return 'evaluate';
  return 'rescue';
}

// === Batch Score (used from content script) ===

export function scoreProfilesBatch(
  profiles: ScrapedProfile[],
  parsedJD: ParsedJD,
  scoringConfig?: ScoringConfig
): { profileIndex: number; algoScore: AlgorithmicScoreBreakdown; tier: ScoringTier }[] {
  const merged = mergeConfigs(scoringConfig, FALLBACK_CONFIG);
  const lookupMaps = buildLookupMaps(merged);
  const weights = merged.weights
    ? { skill: merged.weights.skill / 100, experience: merged.weights.experience / 100, location: merged.weights.location / 100, education: merged.weights.education / 100 }
    : DEFAULT_WEIGHTS;

  return profiles.map((profile, index) => {
    const algoScore = scoreProfileAlgorithmically(profile, parsedJD, lookupMaps, weights);
    const tier = determineTier(algoScore.totalScore);
    return { profileIndex: index, algoScore, tier };
  });
}
