import { useState } from "react";
import { api, monthLabel, Payslip, rupees } from "../api";
import { useAuth } from "../auth";
import { Card, Sheet, Status, useLoad } from "../ui";

export function PayslipView({ slip, name, onClose }: { slip: Payslip; name: string; onClose: () => void }) {
  const { me } = useAuth();
  const b = slip.breakdown;
  const deductions: [string, number][] = [
    ["Provident Fund (12%)", b.deductions.pf],
    ["ESI (0.75%)", b.deductions.esi],
    ["Professional Tax", b.deductions.pt],
    ["Income tax (TDS)", b.deductions.tds],
  ];
  return (
    <Sheet title={`Payslip, ${monthLabel(slip.month)}`} onClose={onClose}>
      <div className="slip">
        <div className="slip-head">
          <div><div className="slip-co">{me?.company.legalName}</div><div className="meta">Payslip for {monthLabel(slip.month)}</div></div>
          <div className="r"><div className="meta">Employee</div><b>{name}</b></div>
        </div>
        <div className="card-b meta">Paid days {b.paidDays} of {b.daysInMonth}{b.lopDays ? `, ${b.lopDays} loss of pay` : ""}</div>
        <div className="slip-cols">
          <table>
            <thead><tr><th>Earnings</th><th className="r">Amount</th></tr></thead>
            <tbody>
              <tr><td>Basic</td><td className="r num">{rupees(b.earnings.basic)}</td></tr>
              <tr><td>House rent allowance</td><td className="r num">{rupees(b.earnings.hra)}</td></tr>
              <tr><td>Special allowance</td><td className="r num">{rupees(b.earnings.special)}</td></tr>
            </tbody>
            <tfoot><tr><td>Gross earnings</td><td className="r num">{rupees(b.earnings.gross)}</td></tr></tfoot>
          </table>
          <table>
            <thead><tr><th>Deductions</th><th className="r">Amount</th></tr></thead>
            <tbody>
              {deductions.filter(([k, v]) => v > 0 || k.startsWith("Provident")).map(([k, v]) => <tr key={k}><td>{k}</td><td className="r num">{rupees(v)}</td></tr>)}
            </tbody>
            <tfoot><tr><td>Total deductions</td><td className="r num">{rupees(b.deductions.total)}</td></tr></tfoot>
          </table>
        </div>
        <div className="slip-net"><span>Net pay</span><span className="v num">{rupees(slip.netPay)}</span></div>
        <div className="words">{slip.netPayInWords}</div>
      </div>
      <p className="meta">Employer contributions not shown above: PF {rupees(b.employer.epf)}, pension (EPS) {rupees(b.employer.eps)}{b.employer.esi ? `, ESI ${rupees(b.employer.esi)}` : ""}.</p>
    </Sheet>
  );
}

export function MyPayslips() {
  const { me } = useAuth();
  const { data, error, loading } = useLoad(() => api<Payslip[]>("/payslips/me"), []);
  const [open, setOpen] = useState<Payslip | null>(null);
  return (
    <Card title="Payslips" sub="Released after HR locks each month's payroll">
      <Status loading={loading} error={error} empty={data?.length === 0 && "No payslips have been released yet."} />
      {data && data.length > 0 && (
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Month</th><th className="r">Paid days</th><th className="r">Gross</th><th className="r">Deductions</th><th className="r">Net pay</th></tr></thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id} className="click" tabIndex={0} onClick={() => setOpen(p)} onKeyDown={(e) => e.key === "Enter" && setOpen(p)}>
                  <td>{monthLabel(p.month)}</td>
                  <td className="r num">{p.breakdown.paidDays}/{p.breakdown.daysInMonth}</td>
                  <td className="r num">{rupees(p.breakdown.earnings.gross)}</td>
                  <td className="r num">{rupees(p.breakdown.deductions.total)}</td>
                  <td className="r num"><b>{rupees(p.netPay)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <PayslipView slip={open} name={me?.employee?.name ?? ""} onClose={() => setOpen(null)} />}
    </Card>
  );
}
