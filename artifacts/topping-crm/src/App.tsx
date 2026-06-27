import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ReactNode } from "react";

import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import ForgotPasswordPage from "@/pages/ForgotPasswordPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import DashboardPage from "@/pages/DashboardPage";
import PipelinePage from "@/pages/PipelinePage";
import ApprovalsPage from "@/pages/ApprovalsPage";
import LeadsPage from "@/pages/LeadsPage";
import LeadFormPage from "@/pages/LeadFormPage";
import ClientsPage from "@/pages/ClientsPage";
import CompaniesPage from "@/pages/CompaniesPage";
import SchedulePage from "@/pages/SchedulePage";
import TasksPage from "@/pages/TasksPage";
import KpiPage from "@/pages/KpiPage";
import AssistantPage from "@/pages/AssistantPage";
import TeamPage from "@/pages/TeamPage";
import SettingsPage from "@/pages/SettingsPage";
import FinancePage from "@/pages/FinancePage";
import BookingRequestsPage from "@/pages/BookingRequestsPage";
import PermissionsPage from "@/pages/PermissionsPage";
import AutomationsPage from "@/pages/AutomationsPage";
import MyWorkPage from "@/pages/MyWorkPage";
import CommissionCalculatorPage from "@/pages/CommissionCalculatorPage";
import ShareReportPage from "@/pages/ShareReportPage";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { token, isLoading } = useAuth();
  if (isLoading) return null;
  if (!token) return <Redirect to="/login" />;
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/report/share" component={ShareReportPage} />
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute><DashboardPage /></ProtectedRoute>
      </Route>
      <Route path="/pipeline">
        <ProtectedRoute><PipelinePage /></ProtectedRoute>
      </Route>
      <Route path="/approvals">
        <ProtectedRoute><ApprovalsPage /></ProtectedRoute>
      </Route>
      <Route path="/leads">
        <ProtectedRoute><LeadsPage /></ProtectedRoute>
      </Route>
      <Route path="/leads/:id">
        <ProtectedRoute><LeadFormPage /></ProtectedRoute>
      </Route>
      <Route path="/clients">
        <ProtectedRoute><ClientsPage /></ProtectedRoute>
      </Route>
      <Route path="/companies">
        <ProtectedRoute><CompaniesPage /></ProtectedRoute>
      </Route>
      <Route path="/calendar">
        <ProtectedRoute><SchedulePage /></ProtectedRoute>
      </Route>
      <Route path="/meetings">
        <Redirect to="/calendar" />
      </Route>
      <Route path="/tasks">
        <ProtectedRoute><TasksPage /></ProtectedRoute>
      </Route>
      <Route path="/kpi">
        <ProtectedRoute><KpiPage /></ProtectedRoute>
      </Route>
      <Route path="/assistant">
        <ProtectedRoute><AssistantPage /></ProtectedRoute>
      </Route>
      <Route path="/compensation">
        <Redirect to="/payroll" />
      </Route>
      <Route path="/commission">
        <ProtectedRoute><CommissionCalculatorPage /></ProtectedRoute>
      </Route>
      <Route path="/team">
        <ProtectedRoute><TeamPage /></ProtectedRoute>
      </Route>
      <Route path="/settings">
        <ProtectedRoute><SettingsPage /></ProtectedRoute>
      </Route>
      <Route path="/payroll">
        <ProtectedRoute><FinancePage /></ProtectedRoute>
      </Route>
      <Route path="/bookings">
        <ProtectedRoute><BookingRequestsPage /></ProtectedRoute>
      </Route>
      <Route path="/permissions">
        <ProtectedRoute><PermissionsPage /></ProtectedRoute>
      </Route>
      <Route path="/automations">
        <ProtectedRoute><AutomationsPage /></ProtectedRoute>
      </Route>
      <Route path="/my-work">
        <ProtectedRoute><MyWorkPage /></ProtectedRoute>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
