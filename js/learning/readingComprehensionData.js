/**
 * @file readingComprehensionData.js
 * The 8-story bank used by the reading-comprehension station ("הבנת
 * הנקרא") — a short 2-sentence Hebrew story is shown and read aloud, then
 * a simple multiple-choice question about it is asked. Unlike the other
 * stations' shared distractor pools, each story's `distractors` are
 * curated specifically for THAT story and must never be mixed with any
 * other story's options (see ReadingComprehensionStation.js's buildOptions
 * — it only ever draws from `target.distractors`). Static data only — no
 * logic.
 * @typedef {{label: string, emoji: string}} AnswerOption
 * @typedef {{id: string, story: string, question: string, correct: AnswerOption, distractors: AnswerOption[]}} ReadingComprehensionEntry
 */

/** @type {ReadingComprehensionEntry[]} */
export const READING_COMPREHENSION_STORIES = Object.freeze([
  {
    id: 'dog-ball',
    story: 'הכלב רץ בגן. הוא מצא כדור אדום.',
    question: 'מה מצא הכלב?',
    correct: { label: 'כדור', emoji: '⚽' },
    distractors: [
      { label: 'עץ', emoji: '🌳' },
      { label: 'ספר', emoji: '📖' },
      { label: 'כובע', emoji: '🎩' },
    ],
  },
  {
    id: 'dana-apple',
    story: 'דנה אכלה תפוח ירוק. היא אהבה אותו מאוד.',
    question: 'מה אכלה דנה?',
    correct: { label: 'תפוח', emoji: '🍎' },
    distractors: [
      { label: 'עוגה', emoji: '🎂' },
      { label: 'דג', emoji: '🐟' },
      { label: 'פרח', emoji: '🌸' },
    ],
  },
  {
    id: 'cat-pillow',
    story: 'החתול ישן על הכרית הרכה. הוא היה עייף מאוד.',
    question: 'איפה ישן החתול?',
    correct: { label: 'על הכרית', emoji: '🛏️' },
    distractors: [
      { label: 'בגינה', emoji: '🌳' },
      { label: 'במים', emoji: '🌊' },
      { label: 'על העץ', emoji: '🌲' },
    ],
  },
  {
    id: 'yoav-soccer',
    story: 'יואב שיחק בכדורגל עם החברים. הקבוצה שלו ניצחה.',
    question: 'במה שיחק יואב?',
    correct: { label: 'כדורגל', emoji: '⚽' },
    distractors: [
      { label: 'מוזיקה', emoji: '🎵' },
      { label: 'ציור', emoji: '🎨' },
      { label: 'בישול', emoji: '🍳' },
    ],
  },
  {
    id: 'bird-nest',
    story: 'הציפור בנתה קן על העץ הגבוה. היא שרה שיר יפה.',
    question: 'מה עשתה הציפור על העץ?',
    correct: { label: 'בנתה קן', emoji: '🪺' },
    distractors: [
      { label: 'ישנה', emoji: '😴' },
      { label: 'אכלה עוגה', emoji: '🎂' },
      { label: 'שחתה', emoji: '🌊' },
    ],
  },
  {
    id: 'mom-cake',
    story: 'אמא אפתה עוגת שוקולד ליום ההולדת. כולם שמחו מאוד.',
    question: 'מה אפתה אמא?',
    correct: { label: 'עוגה', emoji: '🎂' },
    distractors: [
      { label: 'מרק', emoji: '🍲' },
      { label: 'לחם', emoji: '🍞' },
      { label: 'פיצה', emoji: '🍕' },
    ],
  },
  {
    id: 'child-coat',
    story: 'הילד לבש מעיל חם כי היה קר בחוץ.',
    question: 'למה הילד לבש מעיל?',
    correct: { label: 'כי היה קר', emoji: '❄️' },
    distractors: [
      { label: 'כי היה חם', emoji: '☀️' },
      { label: 'כי ירד גשם', emoji: '🌧️' },
      { label: 'כי הוא רץ', emoji: '🏃' },
    ],
  },
  {
    id: 'fish-water',
    story: 'הדג שחה מהר במים הכחולים. הוא חיפש אוכל.',
    question: 'איפה שחה הדג?',
    correct: { label: 'במים', emoji: '🌊' },
    distractors: [
      { label: 'בשמיים', emoji: '☁️' },
      { label: 'בגן', emoji: '🌳' },
      { label: 'בבית', emoji: '🏠' },
    ],
  },
]);
