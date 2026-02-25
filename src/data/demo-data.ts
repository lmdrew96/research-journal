import type { AppUserData } from '../types';
import { seedThemes } from './research-themes';

/**
 * Static demo data for read-only portfolio demo mode.
 * Realistic ChaosLimbă research content — no mutations, no persistence.
 */
export const DEMO_DATA: AppUserData = {
  version: 3,
  themes: seedThemes,
  questions: {
    // ── Error-Driven Learning (exploring) ──
    'error-learning-0': {
      status: 'exploring',
      starred: true,
      notes: [
        {
          id: 'demo-note-1',
          content:
            'Hsu, Chen & Tai (2025) distinguish between **direct** and **indirect** corrective feedback in CALL. Indirect feedback (e.g., underlining an error without giving the answer) triggered deeper hypothesis-forming. This maps directly onto ChaosLimbă\'s principle of *productive confusion* — the learner should struggle before seeing the correction.\n\nNeed to look into whether the timing of feedback matters differently for morphological vs. syntactic errors.',
          createdAt: '2026-01-15T14:30:00Z',
          updatedAt: '2026-01-15T14:30:00Z',
        },
        {
          id: 'demo-note-2',
          content:
            'Interesting parallel: Bultena et al. found that L1-L2 conflict *reverses* error-detection ERP signals early on, but normalizes with exposure. Does this mean we should front-load conflict-heavy exercises? Or scaffold them gradually?\n\nHypothesis: front-loading works for high-proficiency learners, scaffolding for beginners. Need to find evidence.',
          createdAt: '2026-01-20T10:15:00Z',
          updatedAt: '2026-01-22T09:00:00Z',
        },
      ],
      userSources: [
        {
          id: 'demo-src-1',
          text: 'Lyster & Ranta (1997) — Corrective Feedback and Learner Uptake',
          doi: '10.1017/S0272263197002034',
          url: null,
          notes: 'Classic taxonomy of feedback types. Recasts vs. elicitation — relevant baseline for ChaosLimbă feedback design.',
          addedAt: '2026-01-16T11:00:00Z',
        },
      ],
      searchPhrases: [
        'corrective feedback CALL depth of processing',
        'indirect feedback hypothesis formation L2',
        'error correction timing morphological acquisition',
      ],
    },

    // ── Error-Driven Learning Q2 (has_findings) ──
    'error-learning-1': {
      status: 'has_findings',
      starred: false,
      notes: [
        {
          id: 'demo-note-3',
          content:
            'Key finding from Bultena et al. (2020): cross-linguistic conflict between L1 English and L2 grammatical gender initially **reverses** the polarity of error-related ERP components (P600 becomes N400-like). With feedback, these signals normalize. This is strong evidence that L1-L2 conflict zones are *uniquely productive* learning sites.\n\nImplication for ChaosLimbă: Romanian grammatical gender exercises should be a *flagship* feature, not something we avoid because it\'s hard.',
          createdAt: '2026-02-01T16:45:00Z',
          updatedAt: '2026-02-01T16:45:00Z',
        },
      ],
      userSources: [],
    },

    // ── Error-Driven Learning Q3 (exploring) ──
    'error-learning-2': {
      status: 'exploring',
      starred: false,
      notes: [
        {
          id: 'demo-note-4',
          content:
            'Mujezinovič et al. (2024) showed that error-driven *unlearning* of one phonological cue enables learning of another. The sequencing matters — you can\'t just introduce the new pattern; you have to first let the learner fail with the misleading L1-based pattern.\n\nThis is essentially the "desirable difficulty" principle applied to morphophonology.',
          createdAt: '2026-02-05T13:20:00Z',
          updatedAt: '2026-02-05T13:20:00Z',
        },
      ],
      userSources: [],
    },

    // ── Non-Linear Development Q1 (has_findings) ──
    'nonlinear-dynamics-0': {
      status: 'has_findings',
      starred: true,
      notes: [
        {
          id: 'demo-note-5',
          content:
            'Li & Zheng (2025) found J-shaped developmental patterns in L2 writing complexity. Variability *increases* right before a proficiency leap. This is exactly what CDST predicts — the system becomes unstable before reorganizing at a higher level.\n\nFor ChaosLimbă analytics: we should track coefficient of variation across exercise attempts. Rising variability = the learner is about to break through, not break down.',
          createdAt: '2026-02-10T09:30:00Z',
          updatedAt: '2026-02-12T14:00:00Z',
        },
        {
          id: 'demo-note-6',
          content:
            'Found a beautiful quote from Larsen-Freeman: "Variability is not noise; it is the signal of a system in the process of self-organizing." Perfect framing for why ChaosLimbă should embrace, not penalize, inconsistency.',
          createdAt: '2026-02-12T14:05:00Z',
          updatedAt: '2026-02-12T14:05:00Z',
        },
      ],
      userSources: [],
      searchPhrases: [
        'J-shaped development L2 complexity CDST',
        'learner variability predictive phase shift',
        'non-linear L2 writing development',
      ],
    },

    // ── Cognitive Load Q1 (concluded) ──
    'cognitive-load-0': {
      status: 'concluded',
      starred: false,
      notes: [
        {
          id: 'demo-note-7',
          content:
            'Concluded: Payne (2020) provides strong theoretical grounding for cognitive load-based task sequencing in CALL. The progression writing → speaking → conversation maps neatly onto ChaosLimbă\'s planned exercise types.\n\n**Design decision:** ChaosLimbă will use a 3-tier task system: (1) recognition/multiple-choice, (2) constrained production (fill-in, sentence building), (3) free production (open-ended prompts). This follows cognitive load theory without requiring real-time speech processing (which we don\'t have yet).',
          createdAt: '2026-02-15T11:00:00Z',
          updatedAt: '2026-02-18T10:30:00Z',
        },
      ],
      userSources: [],
    },

    // ── Affective Dimension Q1 (not_started, but has a note) ──
    'affective-dimension-0': {
      status: 'not_started',
      starred: false,
      notes: [
        {
          id: 'demo-note-8',
          content:
            'Haven\'t dug into this yet, but flagging: Alamer et al. (2022) specifically studied mobile-assisted language learning (MALL) and found that self-determination theory constructs (autonomy, competence, relatedness) mediated the relationship between MALL use and reduced anxiety. This might be the most directly applicable framework for ChaosLimbă\'s motivational design.',
          createdAt: '2026-02-20T08:15:00Z',
          updatedAt: '2026-02-20T08:15:00Z',
        },
      ],
      userSources: [],
    },
  },

  journal: [
    {
      id: 'demo-journal-1',
      content:
        'Big realization today: the "structured chaos" philosophy isn\'t just a branding choice — it\'s actually grounded in CDST. If language development is genuinely non-linear, then a CALL app that forces linear progression is *actively working against* how acquisition happens.\n\nChaosLimbă should feel more like an ecosystem than a staircase. You explore, you fail, you revisit, you connect. The app\'s job is to make that process visible and rewarding, not to flatten it into a progress bar.',
      createdAt: '2026-02-18T20:30:00Z',
      updatedAt: '2026-02-18T20:30:00Z',
      questionId: 'nonlinear-dynamics-0',
      themeId: 'nonlinear-dynamics',
      tags: ['CDST', 'app philosophy', 'insight'],
    },
    {
      id: 'demo-journal-2',
      content:
        'Reading Hsu, Chen & Tai alongside Bultena et al. and a pattern is emerging: the *type* of error matters as much as *whether* you make one. Errors from L1 transfer seem to be more productive than random errors because the learner has a competing hypothesis to revise.\n\nThis means ChaosLimbă should deliberately engineer situations where English-Romanian transfer errors are likely — and then use those moments for targeted feedback.',
      createdAt: '2026-02-10T15:45:00Z',
      updatedAt: '2026-02-10T15:45:00Z',
      questionId: 'error-learning-0',
      themeId: 'error-learning',
      tags: ['error-driven learning', 'L1 transfer', 'synthesis'],
    },
    {
      id: 'demo-journal-3',
      content:
        'Met with Dr. Petersen today about the research direction. She pushed back on my assumption that productive confusion works the same way for ADHD learners. She\'s right — I need to investigate whether executive function differences change how beneficial "desirable difficulty" is.\n\nAdded this as a formal research question. Could be an original contribution if the literature gap is as wide as I think.',
      createdAt: '2026-01-28T17:00:00Z',
      updatedAt: '2026-01-28T17:00:00Z',
      questionId: 'cognitive-load-1',
      themeId: 'cognitive-load',
      tags: ['advisor meeting', 'ADHD', 'research gap'],
    },
    {
      id: 'demo-journal-4',
      content:
        'Spent the evening reading about AI-driven proficiency assessment. Oh et al. (2020) built an automated system for Korean, but it\'s entirely accuracy-based. A CDST-informed approach would look so different — you\'d want to map learner output to interlanguage *stages*, not just correct/incorrect.\n\nI think this is where ChaosLimbă could genuinely innovate. Most apps score you. We could *understand* you.',
      createdAt: '2026-01-22T22:00:00Z',
      updatedAt: '2026-01-22T22:00:00Z',
      questionId: 'ai-technology-0',
      themeId: 'ai-technology',
      tags: ['AI', 'assessment', 'innovation'],
    },
  ],

  library: [
    {
      id: 'demo-article-1',
      title: 'Different types of corrective feedback and their effect on L2 development in CALL',
      authors: ['Hsu, M.', 'Chen, T.', 'Tai, Y.'],
      year: 2025,
      journal: 'TESOL Quarterly',
      doi: '10.1002/tesq.70020',
      url: 'https://doi.org/10.1002/tesq.70020',
      abstract:
        'This study investigates the differential effects of direct and indirect corrective feedback in a computer-assisted language learning environment. Results indicate that indirect feedback promotes deeper cognitive processing and more durable learning outcomes, while direct feedback leads to faster but shallower acquisition.',
      notes:
        'Core paper for feedback design. Indirect feedback = deeper processing. Maps directly to ChaosLimbă\'s delayed-reveal design pattern.',
      excerpts: [
        {
          id: 'demo-excerpt-1',
          quote:
            'Indirect corrective feedback, by requiring learners to generate their own corrections, appears to engage deeper cognitive processes associated with hypothesis testing and metalinguistic awareness.',
          comment:
            'This is the theoretical justification for ChaosLimbă\'s "struggle first, reveal later" feedback pattern.',
          createdAt: '2026-01-16T10:00:00Z',
        },
        {
          id: 'demo-excerpt-2',
          quote:
            'The timing of feedback delivery interacted significantly with error type, such that morphological errors benefited more from delayed feedback while syntactic errors showed no timing effect.',
          comment:
            'Important for implementation — we should delay feedback on morphology exercises but can be immediate for syntax.',
          createdAt: '2026-01-17T14:30:00Z',
        },
      ],
      linkedQuestions: ['error-learning-0'],
      status: 'key-source',
      tags: ['corrective feedback', 'CALL', 'cognitive processing'],
      aiSummary:
        'This study compared direct corrective feedback (explicitly providing the correct form) with indirect corrective feedback (highlighting errors without correction) in a CALL environment with 86 university-level ESL learners over 12 weeks.\n\nKey findings: (1) Indirect feedback produced significantly higher scores on delayed post-tests, suggesting deeper encoding. (2) The effect was strongest for morphological errors, where learners who received indirect feedback showed evidence of rule internalization rather than item-level memorization. (3) Direct feedback led to faster immediate improvement but poorer retention at 4 weeks.\n\nThe authors propose a "cognitive effort hypothesis" — feedback that requires more effortful processing leads to more robust learning representations. This aligns with desirable difficulty theory and has direct implications for CALL feedback design.',
      isOpenAccess: false,
      savedAt: '2026-01-15T14:00:00Z',
      updatedAt: '2026-01-17T14:30:00Z',
    },
    {
      id: 'demo-article-2',
      title: 'Cross-language activation in bilingual sentence processing: The role of word class meaning',
      authors: ['Bultena, S.', 'Dijkstra, T.', 'van Hell, J.G.'],
      year: 2020,
      journal: 'Language Learning',
      doi: '10.1111/lang.12401',
      url: 'https://doi.org/10.1111/lang.12401',
      abstract:
        'This ERP study examines how cross-linguistic conflict between L1 and L2 grammatical representations affects error monitoring during sentence processing in late bilinguals.',
      notes:
        'Neuroscience evidence for L1-L2 conflict as a productive learning mechanism. The ERP reversal finding is striking.',
      excerpts: [
        {
          id: 'demo-excerpt-3',
          quote:
            'Initially, L1-L2 representational conflicts reversed the polarity of error-related ERP components, but with continued exposure and feedback, neural responses normalized to target-language patterns.',
          comment: 'Direct evidence that conflict zones are where learning happens most intensely.',
          createdAt: '2026-02-01T17:00:00Z',
        },
      ],
      linkedQuestions: ['error-learning-1', 'error-learning-0'],
      status: 'done',
      tags: ['neuroscience', 'ERP', 'cross-linguistic transfer'],
      aiSummary: null,
      isOpenAccess: false,
      savedAt: '2026-01-20T09:00:00Z',
      updatedAt: '2026-02-01T17:00:00Z',
    },
    {
      id: 'demo-article-3',
      title: 'Error-driven unlearning of phonological cue associations in L2 morphology',
      authors: ['Mujezinovič, A.', 'Kapatsinski, V.', 'van de Vijver, R.'],
      year: 2024,
      journal: 'Cognitive Science',
      doi: '10.1111/cogs.13450',
      url: 'https://doi.org/10.1111/cogs.13450',
      abstract:
        'We demonstrate that error-driven unlearning of existing cue-outcome associations facilitates acquisition of novel morphophonological patterns, with implications for sequencing of L2 instruction.',
      notes: 'Sequencing paper. Unlearning precedes new learning — must design exercises accordingly.',
      excerpts: [],
      linkedQuestions: ['error-learning-2'],
      status: 'done',
      tags: ['morphology', 'unlearning', 'sequencing'],
      aiSummary: null,
      isOpenAccess: true,
      savedAt: '2026-02-05T12:00:00Z',
      updatedAt: '2026-02-05T13:20:00Z',
    },
    {
      id: 'demo-article-4',
      title: 'J-shaped developmental trajectories in L2 writing complexity: A complex dynamic systems approach',
      authors: ['Li, S.', 'Zheng, Y.'],
      year: 2025,
      journal: "International Journal of Applied Linguistics",
      doi: '10.1111/ijal.12744',
      url: 'https://doi.org/10.1111/ijal.12744',
      abstract:
        'Using a complex dynamic systems theory framework, this longitudinal study traces non-linear patterns in L2 writing complexity development among Chinese learners of English.',
      notes:
        'Strongest empirical evidence I\'ve found for J-shaped L2 development. The variability-as-signal finding is transformative for ChaosLimbă analytics.',
      excerpts: [
        {
          id: 'demo-excerpt-4',
          quote:
            'Increases in intra-individual variability consistently preceded developmental phase shifts, suggesting that variability serves as a leading indicator of imminent reorganization in the L2 writing system.',
          comment: 'This is the quote. Variability is not noise — it\'s the signal.',
          createdAt: '2026-02-10T10:00:00Z',
        },
      ],
      linkedQuestions: ['nonlinear-dynamics-0', 'nonlinear-dynamics-1'],
      status: 'key-source',
      tags: ['CDST', 'writing complexity', 'variability'],
      aiSummary: null,
      isOpenAccess: false,
      savedAt: '2026-02-10T08:00:00Z',
      updatedAt: '2026-02-12T14:00:00Z',
    },
    {
      id: 'demo-article-5',
      title: 'The role of complex dynamic systems theory in language learning research',
      authors: ['Hiver, P.', 'Al-Hoorie, A.H.', 'Murakami, A.'],
      year: 2024,
      journal: 'Language Learning',
      doi: '10.1111/lang.12670',
      url: 'https://doi.org/10.1111/lang.12670',
      abstract:
        'This methodological review examines how CDST has been applied in SLA research and proposes standards for future studies investigating non-linear developmental patterns.',
      notes: 'Good methodological overview. Useful for the thesis lit review section on CDST in SLA.',
      excerpts: [],
      linkedQuestions: ['nonlinear-dynamics-1', 'nonlinear-dynamics-2'],
      status: 'reading',
      tags: ['CDST', 'methodology', 'SLA'],
      aiSummary: null,
      isOpenAccess: false,
      savedAt: '2026-02-08T11:00:00Z',
      updatedAt: '2026-02-14T09:30:00Z',
    },
    {
      id: 'demo-article-6',
      title: 'Cognitive load-based task sequencing for L2 productive skills in CALL',
      authors: ['Payne, J.S.'],
      year: 2020,
      journal: 'Foreign Language Annals',
      doi: '10.1111/flan.12457',
      url: 'https://doi.org/10.1111/flan.12457',
      abstract:
        'This article proposes a cognitive load theory-informed approach to sequencing productive language tasks in computer-assisted learning environments.',
      notes: 'Foundation for ChaosLimbă\'s 3-tier task system. Writing → speaking → conversation progression.',
      excerpts: [],
      linkedQuestions: ['cognitive-load-0'],
      status: 'done',
      tags: ['cognitive load', 'task sequencing', 'productive skills'],
      aiSummary: null,
      isOpenAccess: false,
      savedAt: '2026-02-14T16:00:00Z',
      updatedAt: '2026-02-15T11:00:00Z',
    },
    {
      id: 'demo-article-7',
      title: 'Mobile-assisted language learning, self-determination theory, and L2 anxiety',
      authors: ['Alamer, A.', 'Al Khateeb, A.', 'Jeno, L.M.'],
      year: 2022,
      journal: 'Journal of Computer Assisted Learning',
      doi: '10.1111/jcal.12753',
      url: 'https://doi.org/10.1111/jcal.12753',
      abstract:
        'This study investigates the mediating roles of self-determination theory constructs in the relationship between mobile-assisted language learning and L2 anxiety among Saudi EFL learners.',
      notes: '',
      excerpts: [],
      linkedQuestions: ['affective-dimension-0'],
      status: 'to-read',
      tags: ['MALL', 'motivation', 'anxiety'],
      aiSummary: null,
      isOpenAccess: true,
      savedAt: '2026-02-20T08:30:00Z',
      updatedAt: '2026-02-20T08:30:00Z',
    },
    {
      id: 'demo-article-8',
      title: 'Positive psychology in CALL: A systematic review of affective design principles',
      authors: ['Aydın, S.', 'Tekin, M.'],
      year: 2023,
      journal: 'Review of Education',
      doi: '10.1002/rev3.3420',
      url: 'https://doi.org/10.1002/rev3.3420',
      abstract:
        'This systematic review synthesizes research on positive psychology interventions in computer-assisted language learning, identifying key design principles for promoting learner wellbeing.',
      notes: '',
      excerpts: [],
      linkedQuestions: ['affective-dimension-1'],
      status: 'to-read',
      tags: ['positive psychology', 'wellbeing', 'design'],
      aiSummary: null,
      isOpenAccess: false,
      savedAt: '2026-02-19T14:00:00Z',
      updatedAt: '2026-02-19T14:00:00Z',
    },
    {
      id: 'demo-article-9',
      title: 'Automated proficiency assessment using deep learning: A Korean language case study',
      authors: ['Oh, S.', 'Kim, J.', 'Park, H.', 'Lee, K.'],
      year: 2020,
      journal: 'ETRI Journal',
      doi: '10.4218/etrij.2019-0400',
      url: 'https://doi.org/10.4218/etrij.2019-0400',
      abstract:
        'This paper presents a deep learning approach to automated proficiency assessment for Korean as a foreign language, achieving high accuracy on standardized test benchmarks.',
      notes:
        'Accuracy-focused assessment — exactly the paradigm ChaosLimbă should move beyond. Useful as a contrast case.',
      excerpts: [],
      linkedQuestions: ['ai-technology-0'],
      status: 'done',
      tags: ['AI', 'assessment', 'deep learning'],
      aiSummary: null,
      isOpenAccess: true,
      savedAt: '2026-01-22T21:00:00Z',
      updatedAt: '2026-01-23T10:00:00Z',
    },
    {
      id: 'demo-article-10',
      title: 'Learner analytics and non-linear developmental patterns in technology-mediated L2 learning',
      authors: ['Larsen-Freeman, D.', 'Cameron, L.'],
      year: 2008,
      journal: 'Complex Systems and Applied Linguistics',
      doi: null,
      url: null,
      abstract:
        'A foundational text exploring language as a complex adaptive system, proposing that variability and non-linearity are fundamental features of L2 development rather than measurement artifacts.',
      notes:
        'The book that started CDST in SLA. "Soft assembly" concept is key — learners actively mold resources to situations.',
      excerpts: [
        {
          id: 'demo-excerpt-5',
          quote:
            'Language use and language learning are not different processes. Language learning is language use in the service of language development.',
          comment: 'Foundational framing for why ChaosLimbă should prioritize meaningful use over drill.',
          createdAt: '2026-02-08T15:00:00Z',
        },
      ],
      linkedQuestions: ['nonlinear-dynamics-2', 'nonlinear-dynamics-0'],
      status: 'key-source',
      tags: ['CDST', 'foundational', 'soft assembly'],
      aiSummary: null,
      isOpenAccess: false,
      savedAt: '2026-02-08T14:00:00Z',
      updatedAt: '2026-02-08T15:00:00Z',
    },
  ],

  lastModified: '2026-02-20T08:30:00Z',
};
