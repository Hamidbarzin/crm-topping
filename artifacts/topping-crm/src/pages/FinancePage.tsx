import AppLayout from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, Calculator, Sparkles } from "lucide-react";
import { PayrollContent } from "./PayrollPage";
import { CalculatorTab, ChatTab } from "./CompensationPage";

export default function FinancePage() {
  return (
    <AppLayout>
      <Tabs defaultValue="payroll" className="w-full">
        <div className="px-6 pt-4">
          <TabsList>
            <TabsTrigger value="payroll"><DollarSign className="h-4 w-4 mr-1.5" /> Payroll</TabsTrigger>
            <TabsTrigger value="calculator"><Calculator className="h-4 w-4 mr-1.5" /> Bonus Calculator</TabsTrigger>
            <TabsTrigger value="chat"><Sparkles className="h-4 w-4 mr-1.5" /> AI Chat</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="payroll"><PayrollContent /></TabsContent>
        <TabsContent value="calculator">
          <div className="p-4 md:p-6 max-w-6xl mx-auto w-full"><CalculatorTab /></div>
        </TabsContent>
        <TabsContent value="chat">
          <div className="p-4 md:p-6 max-w-6xl mx-auto w-full"><ChatTab /></div>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
