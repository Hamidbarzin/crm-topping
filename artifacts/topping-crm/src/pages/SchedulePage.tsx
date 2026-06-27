import AppLayout from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, Briefcase } from "lucide-react";
import { CalendarContent } from "./CalendarPage";
import { MeetingsContent } from "./MeetingsPage";

export default function SchedulePage() {
  return (
    <AppLayout>
      <Tabs defaultValue="calendar" className="w-full">
        <div className="px-6 pt-4">
          <TabsList>
            <TabsTrigger value="calendar"><Calendar className="h-4 w-4 mr-1.5" /> Calendar</TabsTrigger>
            <TabsTrigger value="meetings"><Briefcase className="h-4 w-4 mr-1.5" /> Meetings</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="calendar"><CalendarContent /></TabsContent>
        <TabsContent value="meetings"><MeetingsContent /></TabsContent>
      </Tabs>
    </AppLayout>
  );
}
