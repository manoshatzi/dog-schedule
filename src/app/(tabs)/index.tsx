import { TodayList } from "@/components/today-list";
import { useDailyNeeds } from "@/hooks/use-daily-needs";

export default function TodayScreen() {
  const { needs, occurrences, household, userId, setOccurrence } =
    useDailyNeeds();
  return (
    <TodayList
      dogName={household.name}
      userId={userId}
      needs={needs}
      occurrences={occurrences}
      onSetOccurrence={setOccurrence}
    />
  );
}