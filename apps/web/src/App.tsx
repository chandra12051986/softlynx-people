import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { isHrRole, useAuth } from "./auth";
import { Employees } from "./pages/Employees";
import { Approvals, MyLeave } from "./pages/Leave";
import { Login } from "./pages/Login";
import { MyDay } from "./pages/MyDay";
import { MyPayslips } from "./pages/Payslips";
import { Payroll } from "./pages/Payroll";

const HR_NAV = [
  ["/employees", "Employees"],
  ["/approvals", "Leave approvals"],
  ["/payroll", "Payroll"],
] as const;
const SELF_NAV = [
  ["/my-day", "My day"],
  ["/my-leave", "My leave"],
  ["/my-payslips", "My payslips"],
] as const;

export function App() {
  const { session, me, signOut } = useAuth();
  if (!session) return <Login />;

  const hr = isHrRole(session.user.role);
  const hasEmployee = Boolean(session.user.employeeId);
  const nav = [...(hr ? HR_NAV : hasEmployee ? [["/approvals", "Team approvals"] as const] : []), ...(hasEmployee ? SELF_NAV : [])];
  const home = hr ? "/employees" : "/my-day";

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">{(me?.company.name ?? "S")[0]}</div>
          <div>
            <div className="brand-name">{me?.company.name ?? "Softlynx People"}</div>
            <div className="brand-sub">HR and payroll</div>
          </div>
        </div>
        <nav className="nav" aria-label="Main">
          {nav.map(([to, label]) => <NavLink key={to} to={to}>{label}</NavLink>)}
        </nav>
        <div className="side-foot">
          <div>{me?.employee?.name ?? (session.user.role === "OWNER" ? "Company owner" : "")}</div>
          <button type="button" onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <main className="view">
        <Routes>
          {hr && <Route path="/employees" element={<Employees />} />}
          {hr && <Route path="/payroll" element={<Payroll />} />}
          <Route path="/approvals" element={<Approvals />} />
          {hasEmployee && <Route path="/my-day" element={<MyDay />} />}
          {hasEmployee && <Route path="/my-leave" element={<MyLeave />} />}
          {hasEmployee && <Route path="/my-payslips" element={<MyPayslips />} />}
          <Route path="*" element={<Navigate to={home} replace />} />
        </Routes>
      </main>
    </div>
  );
}
