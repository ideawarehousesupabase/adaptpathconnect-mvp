import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Image as ImageIcon, Box } from "lucide-react";
import preview from "@/assets/bathroom-preview.jpg";
import { Button } from "@/components/ui/button";
import { EmptyState, KV, Pill, Section } from "@/components/app/ui-bits";
import { Bathroom3DPreview } from "@/components/app/Bathroom3DPreview";
import { describeForApplicant } from "@/lib/engine";
import { useCase } from "@/lib/workspace";

export const Route = createFileRoute("/_app/cases/$id/preview")({
  component: Preview,
});

function Preview() {
  const { id } = Route.useParams();
  const c = useCase(id)!;
  const { needs, layout, designApproved } = c.derived;
  const [activeTab, setActiveTab] = useState<"3d" | "photo">("3d");

  if (!needs || !c.design || !layout) {
    return (
      <Section>
        <EmptyState
          title="No saved design to preview"
          body="Save a bathroom design first. The preview summarises the fixtures and 3D layout created for the applicant."
          action={
            <Button asChild>
              <Link to={c.assessment ? "/cases/$id/design" : "/cases/$id/assessment"} params={{ id }}>
                {c.assessment ? "Go to Bathroom Design" : "Go to OT Assessment"}
              </Link>
            </Button>
          }
        />
      </Section>
    );
  }

  const status = designApproved ? (
    <Pill t="success">
      <CheckCircle2 className="h-3.5 w-3.5" /> Accessibility Checks Passed
    </Pill>
  ) : (
    <Pill t="warning">
      <AlertTriangle className="h-3.5 w-3.5" /> Accessibility Variance Under Review
    </Pill>
  );

  return (
    <div className="space-y-6">
      {/* Tab toggle between 3D Model and Reference photo */}
      <div className="flex gap-2 border-b border-border pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("3d")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors cursor-pointer ${
            activeTab === "3d" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
          }`}
        >
          <Box className="h-4 w-4" /> 3D Design Preview (Custom Model)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("photo")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors cursor-pointer ${
            activeTab === "photo" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
          }`}
        >
          <ImageIcon className="h-4 w-4" /> Finished Reference Photo
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div>
          {activeTab === "3d" ? (
            <Section className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-base">3D Adaptation Preview</h3>
                  <p className="text-xs text-muted-foreground">
                    Matches your exact room size ({layout.roomW} × {layout.roomD} mm) and saved fixture placements.
                  </p>
                </div>
                {status}
              </div>
              <Bathroom3DPreview layout={layout} />
              <div className="mt-4 flex flex-wrap gap-2">
                {needs.features.map((f) => (
                  <Pill key={f.id} t="info">
                    {f.name}
                  </Pill>
                ))}
              </div>
            </Section>
          ) : (
            <Section className="overflow-hidden p-0!">
              <div className="relative">
                <img
                  src={preview}
                  alt="Illustrative visual of an accessible bathroom"
                  width={1408}
                  height={960}
                  className="w-full object-cover"
                />
                <div className="absolute left-4 top-4">{status}</div>
              </div>
              <div className="flex flex-wrap gap-2 p-4">
                {needs.features.map((f) => (
                  <Pill key={f.id} t="info">
                    {f.name}
                  </Pill>
                ))}
              </div>
            </Section>
          )}
        </div>

        <div className="space-y-5">
          <Section title="Applicant Design Summary">
            <KV k="Applicant" v={c.applicant} />
            <KV k="Design" v={c.adaptation} />
            <KV k="Room Dimensions" v={`${layout.roomW} × ${layout.roomD} mm`} />
            <KV k="Version" v={`V${c.design.version}`} />
            <KV
              k="Design Status"
              v={
                <span className={designApproved ? "text-success font-medium" : "text-warning font-medium"}>
                  {designApproved
                    ? "Accessibility Checks Passed"
                    : `${c.derived.rulesReview} check${c.derived.rulesReview === 1 ? "" : "s"} under review`}
                </span>
              }
            />
            <KV k="OT Assessment" v={c.assessment ? "Completed" : "Not started"} />
          </Section>

          <Section title="For the Applicant & Family">
            <p className="text-sm text-muted-foreground leading-relaxed">{describeForApplicant(needs)}</p>
            <p className="mt-3 text-xs text-muted-foreground border-t border-border pt-2">
              The 3D preview accurately portrays the room proportions and equipment layout for discussion with the family.
            </p>
          </Section>
        </div>
      </div>

      {/* Direct navigation to Cost & Funding */}
      <div className="pt-2">
        <Button asChild size="lg" className="cursor-pointer">
          <Link to="/cases/$id/funding" params={{ id }}>
            Continue to Cost & Funding <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
