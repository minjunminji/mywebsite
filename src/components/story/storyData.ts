// Pure data model for the nav-driven story. No React here.
// Content + asset paths are consumed by StoryPlayer.

// --- Frame asset lists (webp) ---
export const landingFrames = [
  '/Animation/landingloop1.webp',
  '/Animation/landingloop2.webp',
  '/Animation/landingloop3.webp',
  '/Animation/landingloop4.webp',
] as const;

export const trainSequenceFrames = Array.from(
  { length: 20 },
  (_, i) => `/Animation/train${i + 1}.webp`,
);

export const trainLoopFrames = [
  '/Animation/trainloop1.webp',
  '/Animation/trainloop2.webp',
  '/Animation/trainloop3.webp',
  '/Animation/trainloop4.webp',
] as const;

export const aboutFrames = [
  '/Animation/aboutloop1.webp',
  '/Animation/aboutloop2.webp',
  '/Animation/aboutloop3.webp',
  '/Animation/aboutloop4.webp',
] as const;

export const trans1Frames = Array.from({ length: 25 }, (_, i) => `/Animation/1trans${i + 1}.webp`);
export const trans2Frames = Array.from({ length: 22 }, (_, i) => `/Animation/2trans${i + 1}.webp`);
export const turnstileFrames = Array.from({ length: 6 }, (_, i) => `/Animation/turnstile${i + 1}.webp`);
export const turnstileBackgroundFrame = '/turnstile_background.webp';
export const turnstileBackgroundFrameTwo = '/turnstile_background_2.png';

export const projectStills = {
  thisWebsite: '/Animation/thiswebsite.webp',
  rebase: '/Animation/rebase.webp',
  mango: '/Animation/mango.webp',
} as const;

export const ABOUT_REFERENCE_IMAGE = '/about_ref.webp';

// --- Stops: the flat, ordered player timeline ---
export type StopId = 'landing' | 'about' | 'thisWebsite' | 'rebase' | 'mango' | 'experience';

export type Stop = {
  id: StopId;
  loop?: readonly string[]; // animated rest frames (landing, about)
  still?: string; // static rest frame (projects)
  isProject?: boolean;
  isExperience?: boolean;
};

export const STOPS: readonly Stop[] = [
  { id: 'landing', loop: trainLoopFrames },
  { id: 'about', loop: aboutFrames },
  { id: 'thisWebsite', still: projectStills.thisWebsite, isProject: true },
  { id: 'rebase', still: projectStills.rebase, isProject: true },
  { id: 'mango', still: projectStills.mango, isProject: true },
  { id: 'experience', isExperience: true },
];

// SEGMENTS[i] connects STOPS[i] -> STOPS[i+1]
export const SEGMENTS: readonly (readonly string[])[] = [
  trans1Frames, // landing -> about
  trans2Frames, // about -> thisWebsite
  turnstileFrames, // thisWebsite -> rebase
  turnstileFrames, // rebase -> mango
  [], // mango -> experience (generated morph, not frames)
];

export const stopIndexById = (id: StopId): number => STOPS.findIndex((s) => s.id === id);
export const firstProjectIndex = STOPS.findIndex((s) => s.isProject);
export const isProjectStop = (index: number): boolean => STOPS[index]?.isProject === true;
export const isExperienceStop = (index: number): boolean =>
  STOPS[index]?.isExperience === true;

// --- Nav: home (landing) + about + projects (expands into its 3 children) ---
export type NavChild = { stopId: StopId; label: string };
export type NavEntry = { label: string; stopId: StopId; children?: readonly NavChild[] };

export const NAV: readonly NavEntry[] = [
  { label: 'home', stopId: 'landing' },
  { label: 'about', stopId: 'about' },
  {
    label: 'projects',
    stopId: 'thisWebsite',
    children: [
      { stopId: 'thisWebsite', label: 'this website' },
      { stopId: 'rebase', label: 'rebase' },
      { stopId: 'mango', label: 'mango' },
    ],
  },
  { label: 'experience', stopId: 'experience' },
];

// --- About text + timing (consumed by StoryPlayer) ---
export const ABOUT_LINES = [
  "hi, i'm ryan",
  "i'm a junior computer engineering student at the university of british columbia, and i love building things that make me or other people happy",
  'in my spare time, i like to produce music, cook, and play soccer',
] as const;

// About reveal: three fade groups (intro, body, hint). Each fades over
// ABOUT_FADE_DURATION_MS, then waits ABOUT_GROUP_GAP_MS before the next begins.
export const ABOUT_INITIAL_DELAY_MS = 200;
export const ABOUT_FADE_DURATION_MS = 600;
export const ABOUT_GROUP_GAP_MS = 800;

// --- Project content ---
export type ProjectContent = {
  key: 'thisWebsite' | 'rebase' | 'mango';
  title: string;
  techStack: readonly string[];
  body: readonly string[];
  linkHref?: string;
  imageSrc?: string;
  imageAlt?: string;
  imageCaption?: string;
  carouselImages?: readonly (
    | {
        kind: 'image';
        src: string;
        alt: string;
        caption?: string;
      }
    | {
        kind: 'video';
        src: string;
        title?: string;
        posterSrc?: string;
        caption?: string;
      }
  )[];
  videoSrc?: string;
  videoTitle?: string;
};

export const PROJECT_CONTENT: readonly ProjectContent[] = [
  {
    key: 'thisWebsite',
    title: 'this website',
    techStack: ['Next.js', 'React', 'TypeScript', 'WebGL2'],
    body: [
      'my old portfolio was hand-drawn too, but it felt static. i rebuilt it as a hand-drawn world you navigate where each section is its own scene, and the drawings animate to carry you between them.',
      'i challenged myself to learn animation and built a custom frame-by-frame scene system in next.js + react — clicking through the nav plays the hand-drawn sequences forward or backward to move you from one place to the next.',
      'this project is where my love for illustration, design, and frontend engineering all meet.',
    ],
    carouselImages: [
      {
        kind: 'video',
        src: '/animationtimelapse.mp4',
        title: 'Timelapse of drawing',
        posterSrc: '/oldwebsite.webp',
        caption: 'timelapse of drawing',
      },
      {
        kind: 'image',
        src: '/oldwebsite.webp',
        alt: 'Old portfolio website screenshot',
        caption: 'my old website',
      },
    ],
  },
  {
    key: 'rebase',
    title: 'rebase',
    techStack: ['React.js', 'Next.js', 'Supabase', 'Typst', 'Inngest', 'Redis'],
    linkHref: 'http://tryrebase.io/',
    body: [
      'an ai-native resume builder that treats your career as a structured database instead of a folder full of near-identical files. each experience lives once as a reusable block, and you assemble tailored resumes on demand.',
      'drop in a job description and it picks your most relevant experience, rewrites the bullets to fit the role, and renders a clean, ats-friendly pdf with typst.',
      'it also keeps your source material sharp — log wins the moment they happen, and targeted follow-up questions turn "improved performance" into something specific and credible.',
    ],
    carouselImages: [
      {
        kind: 'image',
        src: '/rebase1.webp',
        alt: 'Rebase screenshot 1',
      },
      {
        kind: 'image',
        src: '/rebase2.webp',
        alt: 'Rebase screenshot 2',
      },
      {
        kind: 'image',
        src: '/rebase3.webp',
        alt: 'Rebase screenshot 3',
      },
      {
        kind: 'image',
        src: '/rebase4.webp',
        alt: 'Rebase screenshot 4',
      },
    ],
  },
  {
    key: 'mango',
    title: 'mango',
    techStack: ['Python', 'PyAutoGUI', 'OpenCV', 'MediaPipe'],
    linkHref: 'https://devpost.com/software/mango-full-body-gesture-control-for-any-game',
    body: [
      'mango turns any webcam into a full-body game controller, so you can play minecraft with gestures and movement, no vr headset or external sensors required.',
      'it tracks body motion in real time and maps your movements directly to in-game inputs for a hands-free, immersive control experience.',
      'built in 12 hours with opencv, mediapipe holistic, python, and pyinput, this project won 1st place at hellohacks 2025.',
    ],
    videoSrc: '/mango.mp4',
    videoTitle: 'Mango full-body gesture control demo',
  },
];

// --- Experience content (text-only stop; two lenses over the same roles) ---
export type Lens = 'software' | 'product';
export const LENSES: readonly Lens[] = ['software', 'product'];

export type ExperienceEntry = {
  key: 'shopify' | 'sailbot' | 'paladin';
  year: string; // anchor + ripple origin
  company: string;
  title: string; // fixed across lenses
  bullets: Record<Lens, readonly string[]>;
};

// Bullet count may differ per lens.
export const EXPERIENCE: readonly ExperienceEntry[] = [
  {
    key: 'shopify',
    year: '2026',
    company: 'shopify',
    title: 'software engineer intern',
    bullets: {
      software: [
        'build the experience layer for AI store-theme generation on mobile, including UI implementation, client-side event logic and generation state management',
        'navigate deep stacked-PR workflows (Graphite) within a multi-million-line monorepo, shipping 10 production-ready PRs to main within my first six weeks',
      ],
      product: [
        'redesigned the AI theme-generation experience, converting a blocking 2-minute synchronous wait into an asynchronous background workflow with real-time toast notifications on completion — keeping merchants unblocked throughout.',
        'assumed full product ownership of the mobile experience, coordinating alignment across design, product, and engineering leadership to ship a multi-surface interface (including a custom Skia-based motion loader reused across full-screen and inline states) now rolling out as a core experiment on track to become the default mobile theme-generation flow.',
      ],
    },
  },
  {
    key: 'sailbot',
    year: '2025-2026',
    company: 'ubc sailbot',
    title: 'software website lead',
    bullets: {
      software: [
        'built an end-to-end AIS ship-tracking data pipeline using MongoDB, Redis caching, and webhooks, replacing a commercial vendor and saving $25k/year in subscription fees',
        'engineered a real-time React telemetry dashboard that visualizes autonomous sailboat sensor data, designing the ingestion layer to consume streaming telemetry and store in MongoDB for low-latency frontend fetching',
      ],
      product: [
        'lead a cross-functional subteam of 7 full-stack developers and UI designers, managing deliverables and aligning technical roadmaps with the mechanical and electrical engineering subteams.',
        "owning the product lifecycle for a new recruitment and hiring portal, gathering cross-subteam requirements to streamline the team's engineering onboarding and applicant tracking.",
      ],
    },
  },
  {
    key: 'paladin',
    year: '2025',
    company: 'paladin technologies',
    title: 'systems engineering intern',
    bullets: {
      software: [
        'built a parallelized Python (Pandas) ETL pipeline that automated a manual geospatial workflow, reducing processing time from 8 hours to under 30 seconds (>1,000× speedup) through optimized file I/O and vectorization',
        'developed automated web scrapers to ingest, normalize, and schema-map unstructured vendor data from 200+ hardware platforms into a centralized database for technical evaluation',
      ],
      product: [
        'led technical requirements gathering with City of Vancouver IT and field engineering teams to scope a 250+ site city-wide surveillance upgrade',
        'designed a standardized KMZ metadata specification adopted as the official municipal requirement across all deployment sites to ensure uniform geospatial data logging',
        'synthesized complex hardware capabilities into a structured technical decision matrix, streamlining the procurement process across 200+ vendors',
      ],
    },
  },
];

export type SocialLink = {
  key: 'linkedin' | 'github';
  /** Accessible name for the icon link. */
  label: string;
  href: string;
  /** Icon asset under /public. */
  icon: string;
};

export const SOCIAL_LINKS: readonly SocialLink[] = [
  {
    key: 'linkedin',
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/in/ryankim373/',
    icon: '/linkedin.png',
  },
  {
    key: 'github',
    label: 'GitHub',
    href: 'https://github.com/minjunminji/',
    icon: '/github.png',
  },
];

// Image frames to preload on mount (videos load on demand).
export const ALL_PRELOAD_FRAMES: readonly string[] = [
  ...landingFrames,
  ...trainSequenceFrames,
  ...trainLoopFrames,
  ...trans1Frames,
  ...aboutFrames,
  ...trans2Frames,
  ...turnstileFrames,
  turnstileBackgroundFrame,
  turnstileBackgroundFrameTwo,
  projectStills.thisWebsite,
  projectStills.rebase,
  projectStills.mango,
  ABOUT_REFERENCE_IMAGE,
];
