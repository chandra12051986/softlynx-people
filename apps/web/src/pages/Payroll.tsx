import { useState } from "react";
import { api, ApiError, currentMonth, lakh, monthLabel, Payslip, rupees, STATE_NAMES, WorkState } from "../api";
import { Card, errorText, Pill, Status, useLoad, Who } from "../ui";
import { PayslipView } from "./Payslips";

interface Run {
  run: { id: string; month: string; status: "DRAFT" | "LOCKED"; lockedAt: string | null };
  totals: {
    employees: number; gross: number; deductions: number; net: number; cost: number;
    pfEmployee: number; pfEmployer: number; esiEmployee: number; esiEmployer: number; tds: number;
    professionalTaxByState: Partial<Record<WorkState, number>>;
  };
  payslips: Payslip[];
}

export function Payroll() {
  const months = [currentMonth(-1), currentMonth(0)];
  const [month, setMonth] = useState(months[0]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmLock, setConfirmLock] = useState(false);
  const [open, setOpen] = useState<Payslip | null>(null);
  const { data, error, loading, reload, setData } = useLoad(
    () => api<Run>(`/payroll/runs/${month}?pageSize=500`).catch((e) => (e instanceof ApiError && e.status === 404 ? null : Promise.reject(e))),
    [month],
  );

  const act = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      setMessage(done);
      reload();
    } catch (err) {
      setMessage(errorText(err));
    } finally {
      setBusy(false);
      setConfirmLock(false);
    }
  };

  const compute = () => act(() => api("/payroll/runs", { body: { month } }), `${monthLabel(month)} payroll calculated`);
  const lock = () => act(() => api(`/payroll/runs/${month}/lock`, { method: "POST" }), `${monthLabel(month)} payroll locked. Payslips are released.`);
  const downloadBankFile = async () => {
    try {
      const csv = await api<string>(`/payroll/runs/${month}/bank-file`, { raw: true });
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: `salary-${month}.csv` });
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setMessage(errorText(err));
    }
  };

  const t = data?.totals;
  const locked = data?.run.status === "LOCKED";
  return (
    <>
      <div className="toolbar spread">
        <div className="seg" role="group" aria-label="Payroll month">
          {months.map((m) => (
            <button key={m} aria-pressed={month === m} onClick={() => { setMonth(m); setData(null); setMessage(""); }}>{monthLabel(m)}</button>
          ))}
        </div>
        <div className="toolbar">
          {data && (locked ? <Pill tone="good">Locked</Pill> : <Pill tone="warn">Draft</Pill>)}
          {data && <button className="btn" onClick={downloadBankFile}>Download bank file</button>}
          {!locked && <button className="btn" onClick={compute} disabled={busy}>{data ? "Recalculate" : "Run payroll"}</button>}
          {data && !locked && (confirmLock
            ? <button className="btn primary" onClick={lock} disabled={busy}>Confirm: lock {monthLabel(month)}</button>
            : <button className="btn primary" onClick={() => setConfirmLock(true)}>Lock and release payslips</button>)}
        </div>
      </div>
      {message && <div className="note">{message}</div>}
      <Status loading={loading && !data} error={error} empty={!loading && !error && !data && `Payroll for ${monthLabel(month)} hasn't been run yet. Choose Run payroll to calculate it from attendance.`} />
      {t && (
        <>
          <section className="kpis four">
            <div className="kpi"><span className="k">Gross earnings</span><span className="v">{lakh(t.gross)}</span><span className="s num">{rupees(t.gross)}</span></div>
            <div className="kpi"><span className="k">Employee deductions</span><span className="v">{lakh(t.deductions)}</span><span className="s">PF, ESI, PT and TDS</span></div>
            <div className="kpi accent"><span className="k">Net pay to bank</span><span className="v">{lakh(t.net)}</span><span className="s num">{rupees(t.net)} to {t.employees} people</span></div>
            <div className="kpi"><span className="k">Cost to company</span><span className="v">{lakh(t.cost)}</span><span className="s">Gross plus employer PF and ESI</span></div>
          </section>
          <Card title="Statutory summary" sub="TDS due 7th · PT due 10th (TS, AP) and 20th (KA) · PF and ESI due 15th of next month">
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Component</th><th className="r">Employee share</th><th className="r">Employer share</th><th className="r">Total payable</th></tr></thead>
                <tbody>
                  <tr><td>Provident Fund (EPF + EPS)</td><td className="r num">{rupees(t.pfEmployee)}</td><td className="r num">{rupees(t.pfEmployer)}</td><td className="r num">{rupees(t.pfEmployee + t.pfEmployer)}</td></tr>
                  <tr><td>Employees' State Insurance</td><td className="r num">{rupees(t.esiEmployee)}</td><td className="r num">{rupees(t.esiEmployer)}</td><td className="r num">{rupees(t.esiEmployee + t.esiEmployer)}</td></tr>
                  {(Object.keys(STATE_NAMES) as WorkState[]).filter((s) => t.professionalTaxByState[s] !== undefined).map((s) => (
                    <tr key={s}><td>Professional Tax, {STATE_NAMES[s]}</td><td className="r num">{rupees(t.professionalTaxByState[s]!)}</td><td className="r num">–</td><td className="r num">{rupees(t.professionalTaxByState[s]!)}</td></tr>
                  ))}
                  <tr><td>TDS on salary (Sec 192)</td><td className="r num">{rupees(t.tds)}</td><td className="r num">–</td><td className="r num">{rupees(t.tds)}</td></tr>
                </tbody>
              </table>
            </div>
          </Card>
          <Card title={`Salary register, ${monthLabel(month)}`} sub="Select a row to see the payslip">
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Employee</th><th className="r">Paid days</th><th className="r">Gross</th><th className="r">PF</th><th className="r">ESI</th><th className="r">PT</th><th className="r">TDS</th><th className="r">Net pay</th></tr></thead>
                <tbody>
                  {data!.payslips.map((p) => {
                    const b = p.breakdown;
                    return (
                      <tr key={p.id} className="click" tabIndex={0} onClick={() => setOpen(p)} onKeyDown={(e) => e.key === "Enter" && setOpen(p)}>
                        <td><Who name={p.employee!.name} sub={`${p.employee!.code} · ${p.employee!.state}`} /></td>
                        <td className="r num nowrap">{b.paidDays}/{b.daysInMonth}{b.lopDays > 0 && <> <Pill tone="bad">{b.lopDays} LOP</Pill></>}</td>
                        <td className="r num">{rupees(b.earnings.gross)}</td>
                        <td className="r num">{rupees(b.deductions.pf)}</td>
                        <td className="r num">{b.deductions.esi ? rupees(b.deductions.esi) : "–"}</td>
                        <td className="r num">{rupees(b.deductions.pt)}</td>
                        <td className="r num">{rupees(b.deductions.tds)}</td>
                        <td className="r num"><b>{rupees(p.netPay)}</b></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
      {open && <PayslipView slip={open} name={open.employee!.name} onClose={() => setOpen(null)} />}
    </>
  );
}
