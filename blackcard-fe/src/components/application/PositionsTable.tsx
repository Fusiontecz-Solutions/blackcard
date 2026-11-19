import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Filter, Calendar, Search, ChevronDown } from "lucide-react";
import { formatCurrency, formatDate as formatDateUtil } from "@/lib/utils";

export type CommissionStatus = "Pending" | "Approved" | "Rejected" | "Paid" | "NotRequested";

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: "AGENT" | "ADMIN" | "SCRUBBING" | "UNDERWRITER" | string;
}

export interface Application {
  id: string;
  applicationId: number | string;
  merchantName: string;
  fundedAmount: number;
  createdAt: string; // ISO date
}

export interface CommissionRequest {
  id: string;
  applicationId: string;
  application?: Application;
  agent: User;
  commissionPercent: number;
  commissionAmount: number;
  status: CommissionStatus;
  rejectionReason?: string | null;
  createdAt: string; // ISO date
  updatedAt: string; // ISO date
}

export type TimeRange = "weekly" | "monthly" | "yearly" | "all";

export interface CommissionFilters {
  search: string;
  status: CommissionStatus | "all";
  timeRange: TimeRange;
}

export interface PositionsTableProps {
  initialCommissions?: CommissionRequest[];
  initialApplications?: Application[];
  currentUser?: User | null;
}

/**
 * PositionsTable (repurposed as Commission Requests view)
 *
 * TS-only skeleton:
 * - Types & interfaces
 * - State structure
 * - Function signatures
 * - Basic JSX layout
 * No business logic or API calls implemented.
 */
const PositionsTable: React.FC<PositionsTableProps> = ({
  initialCommissions = [],
  initialApplications = [],
  currentUser = null,
}) => {
  // --- State ---

  const [commissions, 
    // setCommissions

  ] = useState<CommissionRequest[]>(initialCommissions);
  const [applications, 
    // setApplications

  ] = useState<Application[]>(initialApplications);
  // const [user, setUser] = useState<User | null>(currentUser);

  const [selectedRequest, setSelectedRequest] = useState<CommissionRequest | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  const [filters, setFilters] = useState<CommissionFilters>({
    search: "",
    status: "all",
    timeRange: "monthly",
  });

  // --- Derived data (placeholders, no real logic) ---

  const filteredCommissions = useMemo<CommissionRequest[]>(() => {
    // TODO: implement filtering by search, status, timeRange
    return commissions;
  }, [commissions, filters]);

  const summary = useMemo(
    () => ({
      totalFunded: 0, // TODO: compute from commissions/applications
      totalCommission: 0,
      pendingCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      paidCount: 0,
    }),
    [commissions, applications]
  );

  // --- Handlers (signatures only, no logic) ---

  const handleStatusFilterChange = (status: CommissionStatus | "all"): void => {
    setFilters((prev) => ({ ...prev, status }));
    // TODO: implement status filter behavior
  };

  const handleTimeRangeChange = (timeRange: TimeRange): void => {
    setFilters((prev) => ({ ...prev, timeRange }));
    // TODO: implement time range filter behavior
  };

  const handleSearchChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const value = event.target.value;
    setFilters((prev) => ({ ...prev, search: value }));
    // TODO: implement search behavior
  };

  const handleApproveClick = (request: CommissionRequest): void => {
    // TODO: implement approve logic
    void request;
  };

  const handleRejectClick = (request: CommissionRequest): void => {
    setSelectedRequest(request);
    setIsModalOpen(true);
    // TODO: open rejection reason modal, implement reject logic
  };

  const handleRegenerateClick = (request: CommissionRequest): void => {
    setSelectedRequest(request);
    setIsModalOpen(true);
    // TODO: open regenerate modal, allow editing commission %, call regenerate API
  };

  const handleModalClose = (): void => {
    setIsModalOpen(false);
    setSelectedRequest(null);
    // TODO: reset modal-specific state
  };

  // --- Render helpers (light formatting only) ---

  const formatRowDate = (isoDate: string): string =>
    formatDateUtil(isoDate, "-");

  const getAgentName = (agent: User): string => {
    const fullName = `${agent.firstName ?? ""} ${agent.lastName ?? ""}`.trim();
    return fullName || agent.email || "-";
  };

  // --- JSX layout ---

  return (
    <div className="min-h-screen p-4 md:p-6 bg-background">
      <div className="max-w-screen-2xl mx-auto space-y-6">
        {/* Summary tiles */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-lg border bg-card shadow-sm px-5 py-3">
            <p className="text-xs text-muted-foreground font-semibold">Total Funded</p>
            <div className="mt-1 text-xl font-bold">
              {formatCurrency(summary.totalFunded)}
            </div>
          </div>
          <div className="rounded-lg border bg-card shadow-sm px-5 py-3">
            <p className="text-xs text-muted-foreground font-semibold">Total Commission</p>
            <div className="mt-1 text-xl font-bold">
              {formatCurrency(summary.totalCommission)}
            </div>
          </div>
          <div className="rounded-lg border bg-card shadow-sm px-5 py-3">
            <p className="text-xs text-muted-foreground font-semibold">Pending</p>
            <div className="mt-1 text-xl font-bold">{summary.pendingCount}</div>
          </div>
          <div className="rounded-lg border bg-card shadow-sm px-5 py-3">
            <p className="text-xs text-muted-foreground font-semibold">Approved</p>
            <div className="mt-1 text-xl font-bold">{summary.approvedCount}</div>
          </div>
        </section>

        {/* Filters */}
        <section className="rounded-lg border bg-card shadow-sm px-4 py-3 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="flex items-center gap-3 w-full md:max-w-[520px]">
            {/* Status filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="h-9 gap-2 text-muted-foreground bg-card cursor-pointer"
                >
                  <Filter className="size-4" />
                  <span className="capitalize">
                    {filters.status === "all" ? "All Statuses" : filters.status}
                  </span>
                  <ChevronDown className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => handleStatusFilterChange("all")}>
                  All Statuses
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleStatusFilterChange("Pending")}>
                  Pending
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleStatusFilterChange("Approved")}>
                  Approved
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleStatusFilterChange("Rejected")}>
                  Rejected
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleStatusFilterChange("Paid")}>
                  Paid
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search by merchant, agent, or App ID..."
                className="pl-9 h-9 bg-card"
                value={filters.search}
                onChange={handleSearchChange}
              />
            </div>
          </div>

          {/* Time range filter */}
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-9 gap-2">
                  <Calendar className="size-4" />
                  <span className="capitalize">
                    {filters.timeRange === "all"
                      ? "All Time"
                      : filters.timeRange === "weekly"
                      ? "Weekly"
                      : filters.timeRange === "monthly"
                      ? "Monthly"
                      : "Yearly"}
                  </span>
                  <ChevronDown className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => handleTimeRangeChange("weekly")}>
                  Weekly
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleTimeRangeChange("monthly")}>
                  Monthly
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleTimeRangeChange("yearly")}>
                  Yearly
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleTimeRangeChange("all")}>
                  All Time
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </section>

        {/* Commission table */}
        <section className="rounded-sm border bg-card shadow-sm">
          <div className="px-4 py-2 border-b flex items-center justify-between bg-[#F9FAFD]">
            <span className="font-semibold text-base">Commission Requests</span>
          </div>
          <div className="p-2 overflow-x-auto rounded-b-sm">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground border-b">
                  <th className="px-3 py-2">DATE</th>
                  <th className="px-3 py-2">AGENT NAME</th>
                  <th className="px-3 py-2">DEAL / APPLICATION</th>
                  <th className="px-3 py-2">APP ID</th>
                  <th className="px-3 py-2">FUNDED AMOUNT</th>
                  <th className="px-3 py-2">COMMISSION %</th>
                  <th className="px-3 py-2">COMMISSION AMOUNT</th>
                  <th className="px-3 py-2">STATUS</th>
                  <th className="px-3 py-2">REASON</th>
                  <th className="px-3 py-2 text-left">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredCommissions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-4 py-6 text-center text-sm text-muted-foreground"
                    >
                      No commission requests found.
                    </td>
                  </tr>
                ) : (
                  filteredCommissions.map((request) => {
                    const app = request.application;
                    return (
                      <tr key={request.id} className="border-b last:border-b-0">
                        <td className="px-3 py-2 align-middle">
                          {formatRowDate(request.createdAt)}
                        </td>
                        <td className="px-3 py-2 align-middle">
                          {getAgentName(request.agent)}
                        </td>
                        <td className="px-3 py-2 align-middle">
                          {app?.merchantName ?? "-"}
                        </td>
                        <td className="px-3 py-2 align-middle">
                          {app?.applicationId ?? request.applicationId}
                        </td>
                        <td className="px-3 py-2 align-middle">
                          {formatCurrency(app?.fundedAmount ?? 0)}
                        </td>
                        <td className="px-3 py-2 align-middle">
                          {request.commissionPercent}%
                        </td>
                        <td className="px-3 py-2 align-middle">
                          {formatCurrency(request.commissionAmount)}
                        </td>
                        {/* Status placeholder */}
                        <td className="px-3 py-2 align-middle">
                          {/* TODO: replace with status badge component */}
                          <span>{request.status}</span>
                        </td>
                        {/* Reason placeholder (shortened / hover modal handled elsewhere) */}
                        <td className="px-3 py-2 align-top max-w-xs">
                          {/* TODO: truncate to 2 lines and open modal on hover/click */}
                          <span className="text-xs text-foreground">
                            {request.rejectionReason || "—"}
                          </span>
                        </td>
                        {/* Action buttons placeholders */}
                        <td className="px-3 py-2 align-middle text-left">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-green-600 text-green-700 hover:bg-green-50"
                              onClick={() => handleApproveClick(request)}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-red-600 text-red-700 hover:bg-red-50"
                              onClick={() => handleRejectClick(request)}
                            >
                              Reject
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-blue-600 text-blue-700 hover:bg-blue-50"
                              onClick={() => handleRegenerateClick(request)}
                            >
                              Regenerate
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Modal placeholder */}
        {isModalOpen && selectedRequest && (
          <div>
            {/* TODO: replace with real Dialog component and full modal content */}
            <p className="text-sm">
              Modal placeholder for request ID: {selectedRequest.id}
            </p>
            <Button variant="outline" size="sm" onClick={handleModalClose}>
              Close
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PositionsTable;