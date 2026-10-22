"use client";

import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
  Legend,
  CartesianGrid,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalysisData } from "@/features/mandates/services/analysis-service";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ArrowRight,
  FileText,
  Building2,
  CheckCircle,
  Grid3x3,
} from "lucide-react";

interface Props {
  data: AnalysisData;
}

const DECISION_COLORS: Record<string, string> = {
  retain: "#3b82f6", // blue-500
  remove: "#ef4444", // red-500
  update: "#f59e0b", // amber-500
  add: "#10b981", // emerald-500
};

const decisionChartConfig: ChartConfig = {
  retain: { label: "Retain", color: DECISION_COLORS.retain },
  remove: { label: "Remove", color: DECISION_COLORS.remove },
  update: { label: "Update", color: DECISION_COLORS.update },
  add: { label: "Add", color: DECISION_COLORS.add },
};

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendValue,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-base font-medium text-gray-600">{title}</h3>
        <Icon className="h-5 w-5 text-gray-400" />
      </div>
      <div className="text-4xl font-bold tracking-tight text-gray-900">
        {value}
      </div>
      {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
      {trend && trendValue && (
        <div
          className={`mt-1 flex items-center gap-1 text-sm font-medium ${
            trend === "down"
              ? "text-emerald-600"
              : trend === "up"
                ? "text-red-600"
                : "text-gray-500"
          }`}
        >
          {trend === "down" ? (
            <ArrowDown className="h-4 w-4" />
          ) : trend === "up" ? (
            <ArrowUp className="h-4 w-4" />
          ) : null}
          <span>{trendValue}</span>
        </div>
      )}
    </div>
  );
}

function DecisionBreakdownChart({
  decisions,
}: {
  decisions: { decision: string; count: number; percentage: number }[];
}) {
  const chartData = decisions.map((d) => ({
    name: d.decision.charAt(0).toUpperCase() + d.decision.slice(1),
    value: d.count,
    fill: DECISION_COLORS[d.decision] || "#6b7280",
  }));

  if (chartData.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-400">
        No decisions recorded yet
      </div>
    );
  }

  return (
    <ChartContainer config={decisionChartConfig} className="h-64 w-full">
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={80}
          paddingAngle={2}
          dataKey="value"
          nameKey="name"
          label={({ name, percent }) =>
            `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`
          }
          labelLine={false}
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.fill} />
          ))}
        </Pie>
        <ChartTooltip content={<ChartTooltipContent />} />
      </PieChart>
    </ChartContainer>
  );
}

function EntityImpactChart({
  entities,
}: {
  entities: {
    entity: string;
    totalCitations: number;
    projectedCitations: number;
    percentageDecrease: number;
  }[];
}) {
  // Sort by largest percentage decrease (relative reduction) and take top 8
  const chartData = [...entities]
    .sort((a, b) => b.percentageDecrease - a.percentageDecrease)
    .slice(0, 8)
    .map((e) => ({
      entity: e.entity,
      current: e.totalCitations,
      projected: e.projectedCitations,
      decrease: e.percentageDecrease,
    }));

  if (chartData.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-400">
        No data available
      </div>
    );
  }

  const impactChartConfig: ChartConfig = {
    current: { label: "Current Mandates", color: "#94a3b8" },
    projected: { label: "Projected Mandates", color: "#3b82f6" },
  };

  return (
    <ChartContainer config={impactChartConfig} className="h-64 w-full">
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ left: 0, right: 20, top: 5, bottom: 5 }}
        barCategoryGap="8%"
        barGap={1}
      >
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" />
        <YAxis
          type="category"
          dataKey="entity"
          width={80}
          tick={{ fontSize: 11 }}
          interval={0}
        />
        <ChartTooltip
          content={({ active, payload }) => {
            if (!active || !payload || !payload.length) return null;
            const data = payload[0].payload;
            return (
              <div className="rounded-lg border bg-white p-3 shadow-lg">
                <p className="mb-2 font-semibold text-gray-900">
                  {data.entity}
                </p>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5 text-gray-600">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#94a3b8]" />
                      Current:
                    </span>
                    <span className="font-medium tabular-nums">
                      {data.current.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5 text-gray-600">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#3b82f6]" />
                      Projected:
                    </span>
                    <span className="font-medium tabular-nums">
                      {data.projected.toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-4 border-t pt-1.5">
                    <span className="text-gray-600">Reduction:</span>
                    <span className="font-semibold text-emerald-600 tabular-nums">
                      -{data.decrease.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            );
          }}
        />
        <Legend />
        <Bar
          dataKey="current"
          fill="#94a3b8"
          name="Current"
          radius={[0, 4, 4, 0]}
          barSize={18}
        />
        <Bar
          dataKey="projected"
          fill="#3b82f6"
          name="Projected"
          radius={[0, 4, 4, 0]}
          barSize={18}
        />
      </BarChart>
    </ChartContainer>
  );
}

function DecisionLegend() {
  return (
    <div className="flex flex-wrap gap-4 text-sm">
      {Object.entries(DECISION_COLORS).map(([decision, color]) => (
        <div key={decision} className="flex items-center gap-2">
          <div
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="text-gray-600 capitalize">{decision}</span>
        </div>
      ))}
    </div>
  );
}

export function AnalysisDashboard({ data }: Props) {
  const { overall, byEntity } = data;

  // Sort entities by total citations for the table
  const sortedEntities = [...byEntity].sort(
    (a, b) => b.totalCitations - a.totalCitations,
  );

  return (
    <div className="space-y-8">
      {/* Co-citation heatmap link */}
      <Link
        href="/analysis/heatmap"
        className="group flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-un-blue/40 hover:bg-gray-50"
      >
        <div className="flex items-center gap-3">
          <Grid3x3 className="h-5 w-5 text-un-blue" />
          <div>
            <p className="text-sm font-semibold text-gray-900">
              Overlapping mandate citations
            </p>
            <p className="text-xs text-gray-500">
              Entity × entity co-citation heatmap — compare 2026 vs 2027
            </p>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-gray-400 transition-transform group-hover:translate-x-0.5" />
      </Link>

      <p className="text-sm text-gray-600">
        Each cited mandate is counted once per entity and subprogramme, even
        when it appears in several source locations. Projected totals apply
        current review decisions, falling back to entity submissions.
      </p>

      {/* Overall Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          title="Entities"
          value={overall.totalEntities}
          subtitle="With citations"
          icon={Building2}
        />
        <StatCard
          title="Distinct Cited Mandates"
          value={overall.totalCitations.toLocaleString()}
          subtitle={`${overall.totalUniqueDocuments.toLocaleString()} unique documents`}
          icon={FileText}
        />
        <StatCard
          title="Total Decisions Made"
          value={overall.totalDecisions.toLocaleString()}
          subtitle={`${overall.citationsWithoutDecisions.toLocaleString()} mandates without decisions`}
          icon={CheckCircle}
        />
        <StatCard
          title="Projected Mandates"
          value={overall.projectedCitations.toLocaleString()}
          subtitle="After applying decisions"
          icon={Building2}
          trend={overall.absoluteDecrease > 0 ? "down" : "neutral"}
          trendValue={
            overall.absoluteDecrease !== 0
              ? `${overall.absoluteDecrease > 0 ? "-" : "+"}${Math.abs(overall.absoluteDecrease).toLocaleString()} (${Math.abs(overall.percentageDecrease).toFixed(1)}%)`
              : undefined
          }
        />
        <StatCard
          title="Projected Documents"
          value={overall.projectedUniqueDocuments.toLocaleString()}
          subtitle="After applying decisions"
          icon={FileText}
          trend={
            overall.projectedUniqueDocuments < overall.totalUniqueDocuments
              ? "down"
              : overall.projectedUniqueDocuments > overall.totalUniqueDocuments
                ? "up"
                : "neutral"
          }
          trendValue={
            overall.projectedUniqueDocuments !== overall.totalUniqueDocuments
              ? `${overall.projectedUniqueDocuments > overall.totalUniqueDocuments ? "+" : ""}${(overall.projectedUniqueDocuments - overall.totalUniqueDocuments).toLocaleString()} (${overall.totalUniqueDocuments > 0 ? (((overall.projectedUniqueDocuments - overall.totalUniqueDocuments) / overall.totalUniqueDocuments) * 100).toFixed(1) : "0.0"}%)`
              : undefined
          }
        />
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Decision Breakdown</CardTitle>
            <p className="text-sm text-gray-500">
              Of all decisions made so far
            </p>
          </CardHeader>
          <CardContent>
            <DecisionBreakdownChart decisions={overall.decisionsBreakdown} />
            <div className="mt-4">
              <DecisionLegend />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Projected Impact by Entity</CardTitle>
            <p className="text-sm text-gray-500">
              Top entities by largest relative mandate reduction
            </p>
          </CardHeader>
          <CardContent>
            <EntityImpactChart entities={byEntity} />
          </CardContent>
        </Card>
      </div>

      {/* Entity Detail Table */}
      <Card>
        <CardHeader>
          <CardTitle>Entity-Level Analysis</CardTitle>
          <p className="text-sm text-gray-500">
            Detailed breakdown of decisions and projected impact per entity
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="px-3 py-3 font-medium whitespace-nowrap text-gray-900">
                    Entity
                  </th>
                  <th className="px-3 py-3 text-right font-medium whitespace-nowrap text-gray-900">
                    Mandates
                  </th>
                  <th className="px-3 py-3 text-right font-medium whitespace-nowrap text-gray-900">
                    <span className="inline-flex items-center gap-1">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: DECISION_COLORS.retain }}
                      />
                      Retain
                    </span>
                  </th>
                  <th className="px-3 py-3 text-right font-medium whitespace-nowrap text-gray-900">
                    <span className="inline-flex items-center gap-1">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: DECISION_COLORS.remove }}
                      />
                      Remove
                    </span>
                  </th>
                  <th className="px-3 py-3 text-right font-medium whitespace-nowrap text-gray-900">
                    <span className="inline-flex items-center gap-1">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: DECISION_COLORS.update }}
                      />
                      Update
                    </span>
                  </th>
                  <th className="px-3 py-3 text-right font-medium whitespace-nowrap text-gray-900">
                    <span className="inline-flex items-center gap-1">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: DECISION_COLORS.add }}
                      />
                      Add
                    </span>
                  </th>
                  <th className="px-3 py-3 text-right font-medium whitespace-nowrap text-gray-900">
                    No Decision
                  </th>
                  <th className="px-3 py-3 text-right font-medium whitespace-nowrap text-gray-900">
                    Projected
                  </th>
                  <th className="px-3 py-3 text-right font-medium whitespace-nowrap text-gray-900">
                    Change
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedEntities.map((entity) => {
                  const changeIsNegative = entity.absoluteDecrease > 0;
                  const changeIsPositive = entity.absoluteDecrease < 0;

                  return (
                    <tr
                      key={entity.entity}
                      className="border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="px-3 py-3">
                        <div className="font-medium text-gray-900">
                          {entity.entity}
                        </div>
                        {entity.entityLong && (
                          <div className="max-w-xs truncate text-xs text-gray-500">
                            {entity.entityLong}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {entity.totalCitations.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-right text-blue-600 tabular-nums">
                        {entity.retainCount > 0 ? entity.retainCount : "—"}
                      </td>
                      <td className="px-3 py-3 text-right text-red-600 tabular-nums">
                        {entity.removeCount > 0 ? entity.removeCount : "—"}
                      </td>
                      <td className="px-3 py-3 text-right text-amber-600 tabular-nums">
                        {entity.updateCount > 0 ? entity.updateCount : "—"}
                      </td>
                      <td className="px-3 py-3 text-right text-emerald-600 tabular-nums">
                        {entity.addCount > 0 ? entity.addCount : "—"}
                      </td>
                      <td className="px-3 py-3 text-right text-gray-400 tabular-nums">
                        {entity.noDecisionCount > 0
                          ? entity.noDecisionCount.toLocaleString()
                          : "—"}
                      </td>
                      <td className="px-3 py-3 text-right font-medium tabular-nums">
                        {entity.projectedCitations.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {entity.absoluteDecrease !== 0 ? (
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-medium ${
                              changeIsNegative
                                ? "text-emerald-600"
                                : changeIsPositive
                                  ? "text-red-600"
                                  : "text-gray-400"
                            }`}
                          >
                            {changeIsNegative ? (
                              <ArrowDown className="h-3 w-3" />
                            ) : (
                              <ArrowUp className="h-3 w-3" />
                            )}
                            {Math.abs(entity.absoluteDecrease)} (
                            {Math.abs(entity.percentageDecrease).toFixed(1)}%)
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50 font-medium">
                  <td className="px-3 py-3 text-gray-900">Total</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {overall.totalCitations.toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-right text-blue-600 tabular-nums">
                    {byEntity.reduce((s, e) => s + e.retainCount, 0) || "—"}
                  </td>
                  <td className="px-3 py-3 text-right text-red-600 tabular-nums">
                    {byEntity.reduce((s, e) => s + e.removeCount, 0) || "—"}
                  </td>
                  <td className="px-3 py-3 text-right text-amber-600 tabular-nums">
                    {byEntity.reduce((s, e) => s + e.updateCount, 0) || "—"}
                  </td>
                  <td className="px-3 py-3 text-right text-emerald-600 tabular-nums">
                    {byEntity.reduce((s, e) => s + e.addCount, 0) || "—"}
                  </td>
                  <td className="px-3 py-3 text-right text-gray-400 tabular-nums">
                    {byEntity
                      .reduce((s, e) => s + e.noDecisionCount, 0)
                      .toLocaleString() || "—"}
                  </td>
                  <td className="px-3 py-3 text-right font-bold tabular-nums">
                    {overall.projectedCitations.toLocaleString()}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {overall.absoluteDecrease !== 0 ? (
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-medium ${
                          overall.absoluteDecrease > 0
                            ? "text-emerald-600"
                            : "text-red-600"
                        }`}
                      >
                        {overall.absoluteDecrease > 0 ? (
                          <ArrowDown className="h-3 w-3" />
                        ) : (
                          <ArrowUp className="h-3 w-3" />
                        )}
                        {Math.abs(overall.absoluteDecrease).toLocaleString()} (
                        {Math.abs(overall.percentageDecrease).toFixed(1)}%)
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
