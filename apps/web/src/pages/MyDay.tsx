import { useState } from "react";
import { api, currentMonth, monthLabel } from "../api";
import { useAuth } from "../auth";
import { Card, errorText, Status, useLoad } from "../ui";

interface Day {
  date: string;
  status: "PRESENT" | "WFH" | "LEAVE" | "ABSENT";
  checkIn: string | null;
  checkOut: string | null;
}

const SHORT = { PRESENT: "Present", WFH: "WFH", LEAVE: "Leave", ABSENT: "Absent" } as const;
const CLS = { PRESENT: "c-P", WFH: "c-WFH", LEAVE: "c-L", ABSENT: "c-A" } as const;
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }) : "--:--");

export function MyDay() {
  const { me } = useAuth();
  const month = currentMonth();
  const { data, error, loading, reload } = useLoad(() => api<Day[]>(`/attendance?month=${month}`), [month]);
  const [message, setMessage] = useState("");

  const now = new Date();
  const todayKey = `${month}-${String(now.getDate()).padStart(2, "0")}`;
  const today = data?.find((d) => d.date === todayKey);
  const weekend = now.getDay() === 0 || now.getDay() === 6;

  const punch = async (path: string, body?: object) => {
    try {
      await api(`/attendance/${path}`, { method: "POST", body });
      setMessage("");
      reload();
    } catch (err) {
      setMessage(errorText(err));
    }
  };

  const [y, m] = month.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  const firstDow = new Date(y, m - 1, 1).getDay();
  const byDate = new Map(data?.map((d) => [d.date, d]));
  const hour = now.getHours();

  return (
    <>
      <section className="hello">
        <div>
          <h2>{hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}, {me?.employee?.name.split(" ")[0] ?? ""}</h2>
          <div className="meta">{me?.employee ? `${me.employee.designation} · ${me.employee.code}` : ""}</div>
        </div>
        {weekend ? <div className="meta">Weekly off</div> : today?.status === "LEAVE" ? <div className="meta">You're on approved leave today.</div> : (
          <div className="punch">
            <div className="t"><span>Check in</span>{time(today?.checkIn ?? null)}</div>
            <div className="t"><span>Check out</span>{time(today?.checkOut ?? null)}</div>
            {!today?.checkIn && <>
              <button className="btn primary" onClick={() => punch("check-in", { workFromHome: false })}>Check in</button>
              <button className="btn ghost" onClick={() => punch("check-in", { workFromHome: true })}>Work from home</button>
            </>}
            {today?.checkIn && !today.checkOut && <button className="btn primary" onClick={() => punch("check-out")}>Check out</button>}
          </div>
        )}
      </section>
      {message && <div className="note err">{message}</div>}
      <Card title={`My attendance, ${monthLabel(month)}`}>
        <Status loading={loading && !data} error={error} />
        <div className="card-b">
          <div className="cal">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div className="dow" key={d}>{d}</div>)}
            {Array.from({ length: firstDow }, (_, i) => <div key={`pad${i}`} />)}
            {Array.from({ length: days }, (_, i) => {
              const date = `${month}-${String(i + 1).padStart(2, "0")}`;
              const d = byDate.get(date);
              const dow = new Date(y, m - 1, i + 1).getDay();
              const cls = d ? CLS[d.status] : dow === 0 || dow === 6 ? "c-WO" : "c-F";
              return (
                <div key={date} className={`cell ${cls} ${date === todayKey ? "today" : ""}`}>
                  {i + 1}<small>{d ? SHORT[d.status] : ""}</small>
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    </>
  );
}
