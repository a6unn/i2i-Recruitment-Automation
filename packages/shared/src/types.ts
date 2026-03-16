// === Scoring Config ===

export interface ScoringConfig {
  skillSynonymGroups: string[][];
  locationAliasGroups: string[][];
  regionGroups: Record<string, string[]>;
  educationGroups: string[][];
  weights?: { skill: number; experience: number; location: number; education: number };
}

// === JD Types ===

export interface ParsedJD {
  mustHaveSkills: string[];
  niceToHaveSkills: string[];
  experienceRange: {
    min: number;
    max: number;
  };
  locations: string[];
  education: string[];
  salary: {
    min?: number;
    max?: number;
    currency?: string;
  } | null;
  jobTitle: string;
  industry?: string;
  employmentType?: string;
  keyResponsibilities: string[];
}

export interface SearchQuery {
  variant: 'broad' | 'focused' | 'niche';
  label: string;
  query: string;
  characterCount: number;
  suggestedFilters: {
    experience?: { min: number; max: number };
    location?: string[];
    salary?: { min?: number; max?: number };
    freshness?: string;
    industry?: string;
  };
}

export interface SearchQueryResult {
  queries: SearchQuery[];
  tips: string[];
}

// === Candidate Types ===

export type PipelineStatus =
  | 'SCREENED'
  | 'SHORTLISTED'
  | 'CALLED'
  | 'SUBMITTED'
  | 'REJECTED';

export type InterestLevel =
  | 'INTERESTED'
  | 'NOT_INTERESTED'
  | 'MAYBE'
  | 'SALARY_MISMATCH'
  | 'NOTICE_PERIOD_ISSUE';

export interface ScoreBreakdown {
  skillMatch: number;
  experienceMatch: number;
  locationMatch: number;
  overallFit: number;
}

export interface CandidateScore {
  matchScore: number;
  scoreBreakdown: ScoreBreakdown;
  reasoning: string;
  redFlags: string[];
  highlights: string[];
}

export interface ScrapedProfile {
  name: string;
  currentTitle?: string;
  currentCompany?: string;
  totalExperience?: string;
  location?: string;
  skills: string[];
  salary?: string;
  education?: string;
  lastActive?: string;
  profileSummary?: string;
  profileUrl?: string;
}

// === Extension Message Types ===

export type ExtensionMessage =
  | { type: 'SCORE_PROFILES'; profiles: ScrapedProfile[]; jdId: string; algorithmicScores?: HybridScoreRequest['algorithmicScores'] }
  | { type: 'SCORE_RESULT'; scores: ScoredCandidate[] }
  | { type: 'GET_AUTH' }
  | { type: 'SET_AUTH'; token: string; user: ExtensionUser }
  | { type: 'LOGOUT' }
  | { type: 'GET_ACTIVE_JD' }
  | { type: 'SET_ACTIVE_JD'; jd: ActiveJD }
  | { type: 'GET_STATS' }
  | { type: 'SHORTLIST_CANDIDATES'; candidateIds: string[] }
  | { type: 'ADD_NOTE'; candidateId: string; content: string }
  | { type: 'EXPORT_CSV'; jdId: string }
  | { type: 'SCORING_PROGRESS'; scored: number; total: number; inProgress: boolean }
  | { type: 'SCORE_DISAGREE'; candidateId: string; profileUrl: string; currentScore: number };

export interface ExtensionUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface ActiveJD {
  id: string;
  title: string;
  clientName?: string;
  parsedData: ParsedJD;
  scoringConfig?: ScoringConfig;
}

export interface ScoredCandidate {
  id: string;
  name: string;
  profileUrl: string;
  matchScore: number;
  scoreBreakdown: ScoreBreakdown;
  reasoning: string;
  redFlags: string[];
  highlights: string[];
  currentTitle?: string;
  currentCompany?: string;
  totalExperience?: string;
  location?: string;
  skills: string[];
  pipelineStatus: string;
  noteCount: number;
  scoreSource?: 'algorithmic' | 'hybrid' | 'llm';
  algorithmicBreakdown?: AlgorithmicScoreBreakdown;
  aiReviewed?: boolean;
  tier?: ScoringTier;
  hiddenGem?: boolean;
}

export interface BatchScoreRequest {
  profiles: ScrapedProfile[];
  jdId: string;
}

export interface BatchScoreResponse {
  scores: ScoredCandidate[];
}

// === Hybrid Scoring Types ===

export interface AlgorithmicScoreBreakdown {
  skillScore: number;
  experienceScore: number;
  locationScore: number;
  educationScore: number;
  totalScore: number;
  skillHits: string[];
  skillMisses: string[];
  niceToHaveHits: string[];
  experienceParsed: number | null; // parsed years, null if unparsable
  experienceRange: { min: number; max: number } | null;
  locationMatch: 'exact' | 'region' | 'none' | 'not_required';
  educationMatch: 'meets' | 'below' | 'above' | 'unknown';
}

export type ScoringTier = 'confirm' | 'evaluate' | 'rescue';

export interface HybridScoreRequest {
  profiles: ScrapedProfile[];
  jdId: string;
  algorithmicScores: {
    profileIndex: number;
    algoScore: AlgorithmicScoreBreakdown;
    tier: ScoringTier;
  }[];
}

export interface HybridScoreResponse {
  scores: ScoredCandidate[];
}

export interface ScoringStats {
  total: number;
  green: number;
  yellow: number;
  red: number;
  bestScore: number;
  bestName: string;
  inProgress: boolean;
  algoScoredCount?: number;
  aiReviewedCount?: number;
  aiInProgressCount?: number;
}

// === API Response Types ===

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
