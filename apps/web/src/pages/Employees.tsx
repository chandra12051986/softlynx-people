import { FormEvent, useState } from "react";
import { api, dateLabel, Employee, lakh, STATE_NAMES, WorkState } from "../api";
import { Card, errorText, Pill, Sheet, Status, useLoad, Who } from "../ui";

const CITIES: [string, WorkState][] = [["Hyderabad", "TS"], ["Visakhapatnam", "AP"], ["Vijayawada", "AP"], ["Bengaluru", "KA"]];
const DEPARTMENTS = ["Data Operations", "Data Engineering", "Analytics", "Product", "Sales", "Finance", "HR & Admin"];
const PAGE = 25;

export function Employees() {
  const [q, setQ] = useState("");
  const [state, setState] = useState("");
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE), ...(q && { q }), ...(state && { state }) });
  const { data, error, loading, reload } = useLoad(
    () => api<{ items: Employee[]; total: number }>(`/employees?${params}`),
    [params.toString()],
  );
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE)) : 1;

  return (
    <>
      <div className="toolbar">
        <input className="grow" type="search" placeholder="Search name, code, role or city" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Search employees" />
        <select value={state} onChange={(e) => { setState(e.target.value); setPage(1); }} aria-label="State">
          <option value="">All states</option>
          {Object.entries(STATE_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="btn primary" onClick={() => setAdding(true)}>+ Add employee</button>
      </div>
      <Card title="Employees" sub={data ? `${data.total} people` : undefined}>
        <Status loading={loading && !data} error={error} empty={data?.items.length === 0 && "No employees match this search."} />
        {data && data.items.length > 0 && (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Employee</th><th>Department</th><th>Location</th><th>Joined</th><th className="r">Annual CTC</th><th>PAN</th><th>Status</th></tr></thead>
              <tbody>
                {data.items.map((e) => (
                  <tr key={e.id}>
                    <td><Who name={e.name} sub={`${e.code} · ${e.designation}`} /></td>
                    <td>{e.department}</td>
                    <td>{e.city}, {e.state}</td>
                    <td className="nowrap">{dateLabel(e.dateOfJoining.slice(0, 10))}</td>
                    <td className="r num">{lakh(e.annualCtc)}</td>
                    <td className="num">{e.pan}</td>
                    <td><Pill tone={e.status === "ACTIVE" ? "good" : "mute"}>{e.status === "ACTIVE" ? "Active" : e.status}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="pager">
            <span className="num">Page {page} of {pages}</span>
            <button className="btn sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
            <button className="btn sm" disabled={page === pages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        )}
      </Card>
      {adding && <AddEmployee onClose={() => setAdding(false)} onAdded={() => { setAdding(false); reload(); }} />}
    </>
  );
}

function AddEmployee({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    const optional = (v: string) => (v.trim() ? v.trim() : undefined);
    setBusy(true);
    setError("");
    try {
      await api("/employees", {
        body: {
          name: f.name,
          email: optional(f.email),
          designation: f.designation,
          department: f.department,
          city: f.city,
          dateOfJoining: f.dateOfJoining,
          annualCtc: Number(f.annualCtc),
          pan: f.pan,
          uan: optional(f.uan),
          bankAccount: optional(f.bankAccount),
          ifsc: optional(f.ifsc),
        },
      });
      onAdded();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="Add employee" onClose={onClose}>
      <form className="form" onSubmit={submit} noValidate>
        <div className="field full"><label htmlFor="name">Full name</label><input id="name" name="name" placeholder="As on PAN card" /></div>
        <div className="field"><label htmlFor="email">Work email</label><input id="email" name="email" type="email" /></div>
        <div className="field"><label htmlFor="designation">Designation</label><input id="designation" name="designation" /></div>
        <div className="field"><label htmlFor="department">Department</label><select id="department" name="department">{DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}</select></div>
        <div className="field">
          <label htmlFor="city">Work location</label>
          <select id="city" name="city">{CITIES.map(([c, s]) => <option key={c} value={c}>{c}, {STATE_NAMES[s]}</option>)}</select>
          <span className="hint">Decides which state's Professional Tax applies</span>
        </div>
        <div className="field"><label htmlFor="doj">Date of joining</label><input id="doj" name="dateOfJoining" type="date" /></div>
        <div className="field"><label htmlFor="ctc">Annual CTC (₹)</label><input id="ctc" name="annualCtc" type="number" min={120000} step={1000} /></div>
        <div className="field"><label htmlFor="pan">PAN</label><input id="pan" name="pan" maxLength={10} placeholder="ABCDE1234F" /></div>
        <div className="field"><label htmlFor="uan">UAN (if existing)</label><input id="uan" name="uan" maxLength={12} /></div>
        <div className="field"><label htmlFor="bank">Bank account number</label><input id="bank" name="bankAccount" /></div>
        <div className="field"><label htmlFor="ifsc">IFSC</label><input id="ifsc" name="ifsc" maxLength={11} placeholder="HDFC0001234" /></div>
        <div className="full toolbar">
          <button className="btn primary" type="submit" disabled={busy}>{busy ? "Adding…" : "Add employee"}</button>
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
        </div>
        {error && <p className="full err">{error}</p>}
      </form>
    </Sheet>
  );
}
