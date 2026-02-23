import type { ResearchTheme, FlatQuestion } from '../types';

export const researchThemes: ResearchTheme[] = [
  {
    id: "error-learning",
    theme: "Error-Driven Learning & Interlanguage",
    color: "#E85D3A",
    icon: "\u26A1",
    description:
      "How errors, uncertainty, and productive confusion drive L2 cognitive development \u2014 the theoretical heart of ChaosLimb\u0103.",
    questions: [
      {
        q: "How does the timing and type of corrective feedback in a CALL environment affect the depth of cognitive processing during interlanguage development?",
        why: "Directly informs how ChaosLimb\u0103 delivers feedback. Research (Hsu, Chen & Tai, 2025) shows indirect feedback triggers deeper hypothesis-forming than direct correction.",
        appImplication:
          "Design feedback loops that prompt learners to self-correct before revealing answers.",
        tags: ["feedback design", "interlanguage", "CALL"],
        sources: [
          {
            text: "Hsu, Chen & Tai (2025) \u2014 TESOL Quarterly",
            doi: "10.1002/tesq.70020",
          },
        ],
      },
      {
        q: "To what extent do L1-L2 representational conflicts (e.g., English-Romanian grammatical gender) produce measurable learning advantages when errors are made visible to the learner?",
        why: "Bultena et al. (2020) found that cross-linguistic conflict initially reverses error-detection brain signals, but feedback normalizes them \u2014 suggesting errors from L1 interference are uniquely productive.",
        appImplication:
          "Build exercises that deliberately surface English-Romanian structural conflicts (e.g., gendered nouns, case systems) rather than avoiding them.",
        tags: ["cross-linguistic transfer", "error monitoring", "neuroscience"],
        sources: [
          {
            text: "Bultena et al. (2020) \u2014 Language Learning",
            doi: "10.1111/lang.12401",
          },
        ],
      },
      {
        q: "How does 'unlearning' \u2014 the reduction of incorrect L1-based cue associations \u2014 facilitate acquisition of novel L2 morphophonological patterns?",
        why: "Mujezinovi\u0107 et al. (2024) demonstrated that error-driven unlearning of one cue enables learning of another, with implications for how to sequence morphological instruction.",
        appImplication:
          "Design exercise sequences where learners first encounter (and fail at) misleading L1 patterns before the correct L2 pattern is introduced.",
        tags: ["morphology", "error-driven learning", "sequencing"],
        sources: [
          {
            text: "Mujezinovi\u0107, Kapatsinski & van de Vijver (2024) \u2014 Cognitive Science",
            doi: "10.1111/cogs.13450",
          },
        ],
      },
    ],
  },
  {
    id: "nonlinear-dynamics",
    theme: "Non-Linear Development & Complex Systems",
    color: "#7B61FF",
    icon: "\uD83C\uDF00",
    description:
      "Language as a complex adaptive system \u2014 how non-linear trajectories, variability, and phase shifts map onto ChaosLimb\u0103's 'structured chaos' philosophy.",
    questions: [
      {
        q: "Can individual learner variability in L2 development serve as a predictive signal for upcoming phase shifts or breakthroughs in proficiency?",
        why: "Li & Zheng (2025) found J-shaped developmental patterns emerge from local dynamics, and recent CDST research suggests variability precedes developmental leaps.",
        appImplication:
          "Build analytics that track learner variability as a positive signal rather than treating inconsistency as failure.",
        tags: ["CDST", "learner analytics", "variability"],
        sources: [
          {
            text: "Li & Zheng (2025) \u2014 Int'l Journal of Applied Linguistics",
            doi: "10.1111/ijal.12744",
          },
        ],
      },
      {
        q: "How do competitive and supportive interactions between L2 subsystems (vocabulary, syntax, morphology) during non-linear development inform optimal exercise ordering in CALL?",
        why: "CDST research shows subsystems interact dynamically \u2014 growth in one area can temporarily suppress another. This challenges linear curriculum design.",
        appImplication:
          "ChaosLimb\u0103 could adaptively reorder content based on detected subsystem interactions rather than following a fixed progression.",
        tags: ["curriculum design", "dynamic systems", "adaptive learning"],
        sources: [
          {
            text: "Hiver, Al-Hoorie & Murakami (2024) \u2014 Language Learning",
            doi: "10.1111/lang.12670",
          },
          {
            text: "Li & Zheng (2025) \u2014 Int'l Journal of Applied Linguistics",
            doi: "10.1111/ijal.12744",
          },
        ],
      },
      {
        q: "What role does 'soft assembly' \u2014 the real-time molding of language resources to situational demands \u2014 play in technology-mediated L2 learning environments?",
        why: "Larsen-Freeman's concept that learners actively adapt their language resources to each situation suggests CALL apps should present varied, unpredictable contexts rather than controlled drills.",
        appImplication:
          "Design exercises with contextual variability so learners practice 'soft assembly' of Romanian in diverse scenarios.",
        tags: ["soft assembly", "ecological validity", "task design"],
        sources: [
          {
            text: "Larsen-Freeman (2019), cited in Hiver et al. (2024)",
            doi: "10.1111/lang.12670",
          },
        ],
      },
    ],
  },
  {
    id: "cognitive-load",
    theme: "Cognitive Load & ADHD-Informed Design",
    color: "#2ECC71",
    icon: "\uD83E\uDDE0",
    description:
      "How cognitive load theory, attention systems, and neurodivergent processing styles interact with language learning technology design.",
    questions: [
      {
        q: "How does sequencing L2 production tasks by cognitive load (writing \u2192 speaking \u2192 conversation) affect cross-modality skill transfer in CALL environments, particularly for learners with attention regulation differences?",
        why: "Payne (2020) proposes cognitive load-based task sequencing improves L2 productive skills. Intersecting this with ADHD research could reveal unique design needs.",
        appImplication:
          "Build ChaosLimb\u0103's task progression around cognitive load scaffolding, not just linguistic difficulty.",
        tags: ["cognitive load", "task sequencing", "neurodivergent design"],
        sources: [
          {
            text: "Payne (2020) \u2014 Foreign Language Annals",
            doi: "10.1111/flan.12457",
          },
        ],
      },
      {
        q: "Does productive confusion in L2 learning interact differently with executive function profiles (e.g., ADHD) compared to neurotypical learners?",
        why: "If ChaosLimb\u0103's 'structured chaos' approach relies on productive confusion, understanding how this interacts with different attention/executive function profiles is essential for inclusive design.",
        appImplication:
          "Develop adaptive difficulty that calibrates 'chaos level' based on learner response patterns indicating cognitive overload vs. productive struggle.",
        tags: [
          "executive function",
          "inclusive design",
          "productive confusion",
        ],
        sources: [
          {
            text: "Novel intersection \u2014 limited existing literature. Opportunity for original contribution.",
            doi: null,
          },
        ],
      },
    ],
  },
  {
    id: "affective-dimension",
    theme: "Affect, Motivation & Learner Wellbeing",
    color: "#F39C12",
    icon: "\uD83D\uDD25",
    description:
      "The emotional and motivational dimensions of language learning \u2014 anxiety reduction, self-determination, and positive psychology in CALL.",
    questions: [
      {
        q: "How does app-mediated language learning affect the relationship between L2 anxiety, autonomous motivation, and actual achievement outcomes?",
        why: "Alamer et al. (2022) found mobile-assisted learning increased self-motivation and decreased anxiety. Understanding the mechanisms can inform ChaosLimb\u0103's motivational design.",
        appImplication:
          "Design features that foster autonomy (choice, self-pacing) rather than extrinsic pressure (streaks, leaderboards).",
        tags: ["motivation", "anxiety", "self-determination theory"],
        sources: [
          {
            text: "Alamer, Al Khateeb & Jeno (2022) \u2014 J. Computer Assisted Learning",
            doi: "10.1111/jcal.12753",
          },
        ],
      },
      {
        q: "Can 'positive psychology' elements embedded in CALL design (curiosity triggers, flow states, celebration of interlanguage progress) counteract the negative affective impact of error-heavy learning approaches?",
        why: "Error-driven learning is cognitively powerful but emotionally risky. Positive psychology research (Ayd\u0131n & Tekin, 2023) suggests intentional affective design can offset this.",
        appImplication:
          "Frame errors as interlanguage evolution rather than mistakes; design celebrations for productive struggle, not just correct answers.",
        tags: ["positive psychology", "error framing", "emotional design"],
        sources: [
          {
            text: "Ayd\u0131n & Tekin (2023) \u2014 Review of Education",
            doi: "10.1002/rev3.3420",
          },
        ],
      },
    ],
  },
  {
    id: "ai-technology",
    theme: "AI & Adaptive Technology in CALL",
    color: "#3498DB",
    icon: "\uD83E\uDD16",
    description:
      "How AI-powered features can serve interlanguage theory and non-linear acquisition \u2014 the technical frontier of ChaosLimb\u0103.",
    questions: [
      {
        q: "How can AI-driven proficiency assessment move beyond accuracy scoring to capture interlanguage stage, developmental readiness, and productive variability?",
        why: "Current automated assessment (e.g., Oh et al., 2020) focuses on correctness. A CDST-informed approach would value developmental trajectory over snapshot accuracy.",
        appImplication:
          "Build AI assessment that maps learner output to interlanguage stages rather than binary correct/incorrect scoring.",
        tags: ["AI assessment", "interlanguage stages", "proficiency"],
        sources: [
          {
            text: "Oh et al. (2020) \u2014 ETRI Journal",
            doi: "10.4218/etrij.2019-0400",
          },
        ],
      },
      {
        q: "What is the optimal balance between AI-generated adaptive content and human-curated materials in supporting non-linear L2 development?",
        why: "Your own writing argues AI tools reshape language learning with both promise and limitations. This question operationalizes that tension for ChaosLimb\u0103's architecture.",
        appImplication:
          "Define which content types benefit from AI generation (contextual practice sentences, personalized feedback) vs. human curation (cultural context, idiomatic usage).",
        tags: ["AI content generation", "human curation", "hybrid design"],
        sources: [
          {
            text: 'Your essay "New Tech" (Feb 2026) on AI language learning trade-offs',
            doi: null,
          },
        ],
      },
    ],
  },
];

// Helper to get a question ID
export function getQuestionId(themeId: string, questionIndex: number): string {
  return `${themeId}-${questionIndex}`;
}

// Flatten all questions with theme context
export function getAllQuestions(): FlatQuestion[] {
  return researchThemes.flatMap((theme) =>
    theme.questions.map((q, i) => ({
      ...q,
      id: getQuestionId(theme.id, i),
      themeId: theme.id,
      themeLabel: theme.theme,
      themeColor: theme.color,
      questionIndex: i,
    }))
  );
}

// Find a flat question by ID
export function getQuestionById(questionId: string): FlatQuestion | undefined {
  return getAllQuestions().find((q) => q.id === questionId);
}

// Find a theme by ID
export function getThemeById(themeId: string): ResearchTheme | undefined {
  return researchThemes.find((t) => t.id === themeId);
}
