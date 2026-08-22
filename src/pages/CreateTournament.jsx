const db = globalThis.__LOCAL_DB__;

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import BasicsStep from "@/components/wizard/BasicsStep";
import FormatStep from "@/components/wizard/FormatStep";
import RegistrationStep from "@/components/wizard/RegistrationStep";
import RulesStep from "@/components/wizard/RulesStep";

const steps = ["Basics", "Format", "Registration", "Rules"];

export default function CreateTournament() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState({
    name: "", description: "", sport: "Football", season: "", age_category: "", gender: "open",
    format: "league", visibility: "public", registration_open: true, min_teams: 4, max_teams: 16,
    registration_deadline: "", start_date: "", entry_fee: 0, venuesText: "",
    points_win: 3, points_draw: 1, points_loss: 0, group_count: 4, qualifiers_per_group: 2, rules: "",
  });
  const set = (patch) => setData((d) => ({ ...d, ...patch }));

  const publish = async () => {
    setSaving(true);
    const { venuesText, ...rest } = data;
    const created = await db.entities.Tournament.create({
      ...rest,
      venues: venuesText.split(",").map((v) => v.trim()).filter(Boolean),
      status: "registration",
    });
    navigate(`/tournament/${created.id}`);
  };

  const canNext = step !== 0 || (data.name.trim() && data.sport.trim());

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight">Create tournament</h1>
      <div className="mt-6 flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s} className="flex flex-1 flex-col gap-2">
            <div className={`h-1 rounded-full transition-colors ${i <= step ? "bg-foreground" : "bg-border"}`} />
            <span className={`text-xs ${i === step ? "text-foreground" : "text-muted-foreground"}`}>{s}</span>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-3xl border border-border/60 bg-card/60 p-6 backdrop-blur-xl">
        {step === 0 && <BasicsStep data={data} set={set} />}
        {step === 1 && <FormatStep data={data} set={set} />}
        {step === 2 && <RegistrationStep data={data} set={set} />}
        {step === 3 && <RulesStep data={data} set={set} />}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" className="rounded-full" disabled={step === 0} onClick={() => setStep(step - 1)}>
          <ArrowLeft className="mr-1 w-4 h-4" />Back
        </Button>
        {step < steps.length - 1 ? (
          <Button className="rounded-full" disabled={!canNext} onClick={() => setStep(step + 1)}>
            Continue<ArrowRight className="ml-1 w-4 h-4" />
          </Button>
        ) : (
          <Button className="rounded-full" disabled={saving} onClick={publish}>
            <Check className="mr-1 w-4 h-4" />{saving ? "Publishing…" : "Publish tournament"}
          </Button>
        )}
      </div>
    </div>
  );
}
