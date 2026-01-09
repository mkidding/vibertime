import { ADVICE_CATEGORIES } from '../data/adviceTemplates';
import type { AdviceResult } from '../types';

export const getVibeAnalysis = (percentage: number): AdviceResult => {
  // Ensure percentage is within bounds
  const clampedPercentage = Math.max(0, Math.min(100, percentage));

  // Find the matching category
  const category = ADVICE_CATEGORIES.find(
    cat => clampedPercentage >= cat.min && clampedPercentage <= cat.max
  ) || ADVICE_CATEGORIES[0]; // Fallback to lowest if something goes wrong

  // Pick a random title
  const randomTitleIndex = Math.floor(Math.random() * category.titles.length);
  const title = category.titles[randomTitleIndex];

  // Pick a random message from the category
  const randomMsgIndex = Math.floor(Math.random() * category.messages.length);
  const rawMessage = category.messages[randomMsgIndex];

  // Replace placeholder
  const message = rawMessage.replace('[$percentage]', `${clampedPercentage}%`);

  return {
    title,
    message,
    color: category.color,
    borderColor: category.borderColor
  };
};