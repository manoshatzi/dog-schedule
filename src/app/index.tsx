import { TodayList } from "@/components/today-list";
import { useDailyNeeds } from "@/hooks/use-daily-needs";

export default function TodayScreen() {
  const { needs } = useDailyNeeds();
  return <TodayList dogName="Summer" needs={needs} />;
}
