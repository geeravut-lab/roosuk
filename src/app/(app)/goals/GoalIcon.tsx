import { Brain, HeartPulse, Moon, Scale, type LucideIcon } from "lucide-react";
import type { GoalKind } from "@/lib/goals/kinds";

export const GOAL_ICONS: Record<GoalKind, LucideIcon> = {
  weight: Scale,
  sleep: Moon,
  brain: Brain,
  condition: HeartPulse,
};
