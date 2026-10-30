import { FormEvent, useState } from "react";
import { api, dateLabel, LEAVE_NAMES, LeaveRequest } from "../api";
import { useAuth } from "../auth";
import { Card, errorText, Pill, Status, useLoad, Who } from "../ui";

type Balance = Record<keyof typeof LEAVE_NAMES, { quota: number; used: number; pending: number; available: number }>;

const tone = (s: LeaveRequest["status"]) => (s === "APPROVED" ? "good" : s === "PENDING" ? "warn" : s === "REJECTED" ? "bad" : "mute");
const label = (s: string) => s[0] + s.slice(1).toLowerCase();
const range = (l: LeaveRequest) => (l.fromDate === l.toDate ? dateLabel(l.fromDate) : `${dateLabel(l.fromDate)} to ${dateLabel(l.toDate)}`);

/** Requests waiting for the signed-in HR user or manager to decide. */
export function Approvals() {
  const { me } = useAuth();
  const { data, error, loading, reload } = useLoad(() => api<LeaveRequest[]>("/leave-requests?status=PENDING"), []);
  const [message, setMessage] = useState("");
  const waiting = data?.filter((l) => l.employeeId !== me?.employeeId) ?? [];

  const decide = async (l: LeaveRequest, approve: boolean) => {
    try {
      await api(`/leave-requests/${l.id}/decision`, { body: { approve } });
      setMessage(`${approve ? "Approved" : "Rejected"} ${l.employee.name.split(" ")[0]}'s ${LEAVE_NAMES[l.type].toLowerCase()}`);
      reload();
    } catch (err) {
      setMessage(errorText(err));
    }
  };

  return (
    <Card title="Leave requests waiting for approval" sub={message || undefined}>
      <Status loading={loading && !data} error={error} empty={data !== null && waiting.length === 0 && "Nothing is waiting for you."} />
      <div className="list">
        {waiting.map((l) => (
          <div className="li" key={l.id}>
            <div className="grow"><Who name={l.employee.name} sub={`${l.employee.code} · ${l.employee.designation}`} /></div>
            <div className="grow">
              <div><b>{LEAVE_NAMES[l.type]}</b>, {l.days} day{l.days > 1 ? "s" : ""}</div>
              <div className="meta">{range(l)} · {l.reason}</div>
            </div>
            <div className="toolbar">
              <button className="btn sm good" onClick={() => decide(l, true)}>Approve</button>
              <button className="btn sm bad" onClick={() => decide(l, false)}>Reject</button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** The signed-in employee's balances, request form and history. */
export function MyLeave() {
  const { me } = useAuth();
  const balances = useLoad(() => api<Balance>("/leave-balances/me"), []);
  const requests = useLoad(() => api<LeaveRequest[]>("/leave-requests"), []);
  const mine = requests.data?.filter((l) => l.employeeId === me?.employeeId) ?? [];
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
    setBusy(true);
    setError("");
    try {
      await api("/leave-requests", { body: f });
      form.reset();
      balances.reload();
      requests.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async (id: string) => {
    await api(`/leave-requests/${id}/withdraw`, { method: "POST" }).catch((err) => setError(errorText(err)));
    balances.reload();
    requests.reload();
  };

  return (
    <>
      <section className="kpis three">
        {(Object.keys(LEAVE_NAMES) as (keyof typeof LEAVE_NAMES)[]).map((k) => {
          const b = balances.data?.[k];
          return (
            <div className="kpi" key={k}>
              <span className="k">{LEAVE_NAMES[k]}</span>
              <span className="v">{b ? b.available : "–"}<small> of {b?.quota ?? "–"}</small></span>
              <span className="s">{b ? `${b.used} taken${b.pending ? `, ${b.pending} pending` : ""}` : " "}</span>
            </div>
          );
        })}
      </section>
      <div className="grid2">
        <Card title="Apply for leave">
          <form className="card-b form" onSubmit={submit} noValidate>
            <div className="field"><label htmlFor="type">Leave type</label>
              <select id="type" name="type">{Object.entries(LEAVE_NAMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </div>
            <div className="field" />
            <div className="field"><label htmlFor="from">From</label><input id="from" name="fromDate" type="date" /></div>
            <div className="field"><label htmlFor="to">To</label><input id="to" name="toDate" type="date" /></div>
            <div className="field full"><label htmlFor="reason">Reason</label><textarea id="reason" name="reason" placeholder="A line for your manager" /></div>
            <div className="full toolbar"><button className="btn primary" type="submit" disabled={busy}>Send to manager</button></div>
            {error && <p className="full err">{error}</p>}
            <p className="full meta">Weekends are not counted.</p>
          </form>
        </Card>
        <Card title="My requests">
          <Status loading={requests.loading && !requests.data} error={requests.error} empty={requests.data !== null && mine.length === 0 && "You haven't requested any leave yet."} />
          <div className="list">
            {mine.map((l) => (
              <div className="li" key={l.id}>
                <div className="grow"><b>{LEAVE_NAMES[l.type]}</b>, {l.days} day{l.days > 1 ? "s" : ""}<div className="meta">{range(l)} · {l.reason}</div></div>
                <Pill tone={tone(l.status)}>{label(l.status)}</Pill>
                {l.status === "PENDING" && <button className="btn sm bad" onClick={() => withdraw(l.id)}>Withdraw</button>}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
