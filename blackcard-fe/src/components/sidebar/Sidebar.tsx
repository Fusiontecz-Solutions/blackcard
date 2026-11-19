import SvgIcon, { type SvgIconProps } from "@mui/material/SvgIcon";
import Dashboard from "@mui/icons-material/Dashboard";

import People from "@mui/icons-material/People";
import BarChart from "@mui/icons-material/BarChart";
import Settings from "@mui/icons-material/Settings";
import Logout from "@mui/icons-material/Logout";
import History from "@mui/icons-material/History";
import Chat from "@mui/icons-material/Chat";
import Description from "@mui/icons-material/Description";
import Email from "@mui/icons-material/Email";

import HighlightOff from "@mui/icons-material/HighlightOff";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import Block from "@mui/icons-material/Block";
import FactCheck from "@mui/icons-material/FactCheck";
import Article from "@mui/icons-material/Article";
import CheckCircle from "@mui/icons-material/CheckCircle";
import Payments from "@mui/icons-material/Payments";
import Paid from "@mui/icons-material/Paid";
import Mail from "@mui/icons-material/Mail";
import AccountBalance from "@mui/icons-material/AccountBalance";
import Notifications from "@mui/icons-material/Notifications";
import PieChart from "@mui/icons-material/PieChart";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import ContentPasteSearchIcon from '@mui/icons-material/ContentPasteSearch';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';
import {
  Sidebar as UISidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
  SidebarFooter,
  SidebarGroupContent,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "@/redux/store";
import { logout } from "@/redux/actions/authActions";
import { clearApplicationStats } from "@/redux/slices/applicationSlice";
import { clearPaymentDashboard } from "@/redux/slices/paymentDashboardSlice";
import { resetOperationsDashboard } from "@/redux/slices/operationsDashboardSlice";
import { clearVoiceMicSessionFlags } from "@/voice/microphoneWarmup";
import { toast } from "react-toastify";
import { APP_SHORT_ICON_SRC, APP_SHORT_ICON_DARK_SRC ,resolveAppLogoSrc } from "@/constants/appLogo";
import { useTheme } from "@/context/ThemeContext";
import { useMemo, useEffect, useState, type ComponentType } from "react";
import type { Notification } from "@/redux/slices/notificationSlice";
import {
  isSuperAdminRole,
  normalizeRoleKey,
  resolveEffectiveRole,
} from "@/lib/sessionRole";
import {
  buildOperationsPipelineApplicationsUrl,
  buildUnderwriterPipelineApplicationsUrl,
} from "@/constants/dashboardApplicationsNavigation";
import { OPERATIONS_APPLICATIONS_LIST_ALL_QUERY } from "@/constants/operationsDashboardApplications";
import { operationsDashboardStatusTitle } from "@/constants/operationsDashboardApplications";
import {
  getPipelineCountBadgeClass,
  resolveApplicationsPipelineCount,
} from "@/lib/applicationsPipelineFilter";
import {
  getSidebarPipelineActionHint,
  resolveSidebarPipelineActionAccent,
} from "@/lib/sidebarPipelineActionBadge";
import { SidebarPipelineActionBadge } from "@/components/sidebar/SidebarPipelineActionBadge";
import { cn } from "@/lib/utils";
import { clearCrmCacheOnLogout } from "@/lib/crmCache";
import { clearApplicationDetail } from "@/redux/slices/applicationSlice";
import {
  UNDERWRITER_PIPELINE_FILTERS,
  normalizeUnderwriterPipelineParam,
  type UnderwriterPipelineCounts,
} from "@/constants/underwriterPipeline";
import {
  fetchUnderwriterPipelineCounts,
  registerUnderwriterPipelineCountsInvalidator,
} from "@/lib/underwriterPipelineCounts";
import {
  fetchDeclinePipelineCounts,
  registerDeclinePipelineCountsInvalidator,
  resolveDeclinePipelineChildCount,
  type DeclinePipelineCounts,
} from "@/lib/declinePipelineCounts";
import {
  fetchNotAApplicationCount,
  registerNotAApplicationCountInvalidator,
} from "@/lib/notAApplicationCounts";
// import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import PersonIcon from '@mui/icons-material/Person';
import ExpandMore from "@mui/icons-material/ExpandMore";
import VerifiedUser from "@mui/icons-material/VerifiedUser";
import QuestionAnswer from "@mui/icons-material/QuestionAnswer";
import PauseCircle from "@mui/icons-material/PauseCircle";
import FolderOff from "@mui/icons-material/FolderOff";
type SidebarNavIcon = ComponentType<SvgIconProps>;

const SIDEBAR_COLLAPSED_SECTIONS_KEY = "sidebar.collapsedSections";

type PipelineAccent =
  | "approved-by-uw"
  | "approval-sent"
  | "contract-pending"
  | "contract-sent"
  | "contract-signed"
  | "final"
  | "finals-and-funding-call"
  | "disbursement"
  | "on-hold"
  | "funded"
  | "rejected";

type SidebarNavChildItem = {
  label: string;
  operationsStatus?: string;
  pipelineAccent?: PipelineAccent;
  /** Direct link child (for non-pipeline groups like User Management). */
  url?: string;
  icon?: SidebarNavIcon;
};

type SidebarNavItem = {
  label: string;
  url: string;
  icon: SidebarNavIcon;
  /** When set, links to `/applications``fromDashboard=operations` and this `operationsStatus`. */
  operationsStatus?: string;
  /** Underwriter deal-pool inbox tab (`/applications?underwriterClaim=`). */
  underwriterClaim?: "unclaimed" | "claimed" | "mine";
  /** Underwriter sidebar pipeline (`/applications?underwriterPipeline=`). */
  underwriterPipeline?: string;
  /** Underwriter count badge when the link URL differs from the count bucket. */
  underwriterPipelineCount?: string;
  /** Nested contract workflow links shown under a parent row. */
  children?: SidebarNavChildItem[];
  /** Accent + count badge for top-level deal-pipeline rows. */
  pipelineAccent?: PipelineAccent;
  /** Collapsible grouping (e.g. User Management) whose `children` are direct links; the row itself does not navigate. */
  group?: boolean;
};

type SidebarNavSection = {
  title: string;
  items: SidebarNavItem[];
};

/** Emotion + flex/overflow layouts can collapse MUI icons without explicit box metrics. */
const navIconSx: NonNullable<SvgIconProps["sx"]> = {
  fontSize: "1.25rem",
  width: "1.25rem",
  height: "1.25rem",
  minWidth: "1.25rem",
  minHeight: "1.25rem",
  flexShrink: 0,
  display: "block",
  color: "inherit",
};

/** Lucide `screen-share`: monitor + arrow from top-right (syndicators). */
function SyndicatorsSidebarIcon(props: SvgIconProps) {
  const { sx, ...rest } = props;
  return (
    <SvgIcon
      viewBox="0 0 24 24"
      {...rest}
      sx={[
        {
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 2,
          strokeLinecap: "round",
          strokeLinejoin: "round",
        },
        navIconSx,
        ...(sx ? (Array.isArray(sx) ? sx : [sx]) : []),
      ]}
    >
      <path d="M13 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="m17 8 5-5" />
      <path d="M17 3h5v5" />
    </SvgIcon>
  );
}

function NavIcon({ icon: Icon }: { icon: SidebarNavIcon }) {
  return <Icon sx={navIconSx} />;
}

/** Collapsible grouping row (e.g. User Management) whose children are plain links. */
function NavGroup({
  item,
  pathname,
  navButtonClass,
  subNavButtonClass,
}: {
  item: SidebarNavItem;
  pathname: string;
  navButtonClass: string;
  subNavButtonClass: string;
}) {
  const children = item.children ?? [];
  const childActive = (c: SidebarNavChildItem) =>
    !!c.url && (pathname === c.url || pathname.startsWith(`${c.url}/`));
  const anyActive = children.some(childActive);
  const [open, setOpen] = useState(anyActive);
  useEffect(() => {
    if (anyActive) setOpen(true);
  }, [anyActive]);

  return (
    <SidebarMenuItem className="w-full group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
      <SidebarMenuButton
        isActive={anyActive}
        onClick={() => setOpen((v) => !v)}
        className={navButtonClass}
        aria-expanded={open}
      >
        <span className="flex w-full min-w-0 items-center gap-2 group-data-[collapsible=icon]:w-auto group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0">
          <span className="relative shrink-0">
            <NavIcon icon={item.icon} />
          </span>
          <span className="min-w-0 flex-1 truncate group-data-[collapsible=icon]:hidden">{item.label}</span>
          <ExpandMore
            sx={navIconSx}
            className={cn('shrink-0 transition-transform duration-200 group-data-[collapsible=icon]:hidden', open ? '' : '-rotate-90')}
          />
        </span>
      </SidebarMenuButton>
      {open ? (
        <SidebarMenuSub className="mx-1.5 border-l px-2 group-data-[collapsible=icon]:hidden">
          {children.map((c) => (
            <SidebarMenuSubItem key={c.label}>
              <SidebarMenuSubButton asChild isActive={childActive(c)} size="md" className={subNavButtonClass}>
                <Link to={c.url ?? '#'} className="flex w-full min-w-0 items-center gap-2">
                  {c.icon ? (
                    <span className="shrink-0">
                      <NavIcon icon={c.icon} />
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1 truncate">{c.label}</span>
                </Link>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      ) : null}
    </SidebarMenuItem>
  );
}

function isOperationsPipelineItemActive(
  pathname: string,
  searchParams: URLSearchParams,
  operationsStatus: string | undefined,
): boolean {
  if (!operationsStatus) return false;
  const currentStatus = searchParams.get("operationsStatus");
  if (
    operationsStatus === OPERATIONS_APPLICATIONS_LIST_ALL_QUERY &&
    pathname === "/applications" &&
    searchParams.get("fromDashboard") === "operations" &&
    (!currentStatus ||
      currentStatus.toLowerCase() === OPERATIONS_APPLICATIONS_LIST_ALL_QUERY)
  ) {
    return true;
  }
  if (
    operationsStatus === "Finals_And_Funding_Call" &&
    (currentStatus === "Finals_And_Funding_Call" ||
      currentStatus === "Final" ||
      currentStatus === "Funding Call")
  ) {
    return (
      pathname === "/applications" &&
      searchParams.get("fromDashboard") === "operations"
    );
  }
  return (
    pathname === "/applications" &&
    searchParams.get("fromDashboard") === "operations" &&
    currentStatus === operationsStatus
  );
}

function isUnderwriterClaimPipelineItemActive(
  pathname: string,
  searchParams: URLSearchParams,
  underwriterClaim: "unclaimed" | "claimed" | "mine" | undefined,
): boolean {
  if (!underwriterClaim) return false;
  return (
    pathname === "/applications" &&
    !searchParams.get("fromDashboard") &&
    !searchParams.get("underwriterPipeline") &&
    searchParams.get("underwriterClaim") === underwriterClaim
  );
}

function isUnderwriterPipelineItemActive(
  pathname: string,
  searchParams: URLSearchParams,
  underwriterPipeline: string | undefined,
): boolean {
  if (!underwriterPipeline) return false;
  const current = normalizeUnderwriterPipelineParam(
    searchParams.get("underwriterPipeline"),
  );
  const expected = normalizeUnderwriterPipelineParam(underwriterPipeline);
  return (
    pathname === "/applications" &&
    !searchParams.get("fromDashboard") &&
    Boolean(current) &&
    current === expected
  );
}

function resolveUnderwriterSidebarPipelineCount(
  underwriterPipeline: string | undefined,
  counts: UnderwriterPipelineCounts | null,
): number | null {
  if (!underwriterPipeline || !counts) return null;
  const key = normalizeUnderwriterPipelineParam(underwriterPipeline);
  if (!key) return null;
  return counts[key] ?? null;
}

const agentSections: SidebarNavSection[] = [
  {
    title: "",
    items: [
      { label: "Dashboard", url: "/", icon: Dashboard },
      { label: "Notifications", url: "/notifications", icon: Notifications },
      { label: "Clients", url: "/clients", icon: People },
      { label: "Submissions", url: "/applications", icon: InsertDriveFileIcon },
    ],
  },
  {
    title: "INSIGHTS",
    items: [
      { label: "Reports", url: "/reports", icon: Description },
      { label: "ISO Portal", url: "/iso-portal", icon: BarChart },
    ],
  },
  {
    title: "COMMUNICATIONS",
    items: [
      { label: "Team Chat", url: "/team-chat", icon: Chat },
      { label: "Gmail", url: "/gmail", icon: Email },
    ],
  },
  {
    title: "ACCOUNT",
    items: [{ label: "Settings", url: "/user-setting", icon: Settings }],
  },
];

const dealPipelineSection: SidebarNavSection = {
  title: "DEAL PIPELINE",
  items: [
    { label: "Submissions", url: "/applications", icon: InsertDriveFileIcon },
    { label: "Scrubbing", url: "/applications", operationsStatus: "Scrubbing", icon: ContentPasteSearchIcon },
    {
      label: "Underwriter",
      url: "/applications",
      operationsStatus: "Underwriter",
      icon: FactCheck,
    },
    {
      label: "Approve",
      url: "/applications",
      operationsStatus: "Approved",
      icon: VerifiedUser,
      children: [
        {
          label: "By Underwriter",
          operationsStatus: "Approved_By_UW",
          pipelineAccent: "approved-by-uw",
        },
        {
          label: "Sent to Broker",
          operationsStatus: "Approval_Sent",
          pipelineAccent: "approval-sent",
        },
      ],
    },
    {
      label: "Contract",
      url: "/applications",
      operationsStatus: "Contracted",
      icon: Article,
      children: [
        {
          label: "Pending",
          operationsStatus: "Contract_Pending",
          pipelineAccent: "contract-pending",
        },
        {
          label: "Sent",
          operationsStatus: "Contract_Sent",
          pipelineAccent: "contract-sent",
        },
        {
          label: "Signed",
          operationsStatus: "Contract_Signed",
          pipelineAccent: "contract-signed",
        },
        {
          label: "Re-Initiate",
          operationsStatus: "Reinitiate_Contract",
          pipelineAccent: "contract-signed",
        },
      ],
    },
    {
      label: operationsDashboardStatusTitle("Final_Approval"),
      url: "/applications",
      operationsStatus: "Final_Approval",
      icon: VerifiedUser,
      pipelineAccent: "final",
    },
    {
      label: operationsDashboardStatusTitle("Finals_And_Funding_Call"),
      url: "/applications",
      operationsStatus: "Finals_And_Funding_Call",
      icon: CheckCircle,
      pipelineAccent: "finals-and-funding-call",
    },
    {
      label: "Disbursement",
      url: "/applications",
      operationsStatus: "Disbursment",
      icon: AccountBalance,
      pipelineAccent: "disbursement",
    },
    {
      label: operationsDashboardStatusTitle("On_Hold"),
      url: "/applications",
      operationsStatus: "On_Hold",
      icon: PauseCircle,
      pipelineAccent: "on-hold",
    },
    { label: "Funded", url: "/applications", operationsStatus: "Funded", icon: Paid, pipelineAccent: "funded" },
    {
      label: "Decline",
      url: "/applications",
      operationsStatus: "Declined",
      icon: HighlightOff,
      pipelineAccent: "rejected",
      children: [
        {
          label: "Decline request",
          operationsStatus: "Decline_Request",
          pipelineAccent: "rejected",
        },
        {
          label: "Declined by scrubber",
          operationsStatus: "Declined_By_Scrubber",
          pipelineAccent: "rejected",
        },
        {
          label: "Declined by underwriter",
          operationsStatus: "Declined_By_Underwriter",
          pipelineAccent: "rejected",
        },
        {
          label: "Declined by admin",
          operationsStatus: "Declined_By_Admin",
          pipelineAccent: "rejected",
        },
      ],
    },
    { label: "Recently Deleted", url: "/applications", operationsStatus: "Recently_Deleted", icon: DeleteOutline, pipelineAccent: "rejected" },
  ],
};

const underwriterDealPipelineSection: SidebarNavSection = {
  title: "DEAL PIPELINE",
  items: [
    {
      label: "ISO Query",
      url: "/applications",
      icon: QuestionAnswer,
      underwriterPipeline: UNDERWRITER_PIPELINE_FILTERS.ISO_QUERY,
      pipelineAccent: "approval-sent",
    },
    {
      label: "Submissions",
      url: "/applications",
      icon: InsertDriveFileIcon,
      underwriterPipelineCount: UNDERWRITER_PIPELINE_FILTERS.UNCLAIMED,
    },
    {
      label: "Claimed Submissions",
      url: "/applications",
      icon: ContentPasteSearchIcon,
      underwriterPipeline: UNDERWRITER_PIPELINE_FILTERS.CLAIMED,
    },
    {
      label: "Approved",
      url: "/applications",
      icon: VerifiedUser,
      underwriterPipeline: UNDERWRITER_PIPELINE_FILTERS.APPROVED_BY_UW,
      pipelineAccent: "approved-by-uw",
    },
    {
      label: "Decline",
      url: "/applications",
      icon: HighlightOff,
      underwriterPipeline: UNDERWRITER_PIPELINE_FILTERS.DECLINED_BY_UW,
      pipelineAccent: "rejected",
    },
    {
      label: "Admin Sent for Approval",
      url: "/applications",
      icon: FactCheck,
      underwriterPipeline: UNDERWRITER_PIPELINE_FILTERS.FINAL_APPROVAL,
      pipelineAccent: "final",
    },
    {
      label: "Final Approved",
      url: "/applications",
      icon: CheckCircle,
      underwriterPipeline: UNDERWRITER_PIPELINE_FILTERS.FINAL_APPROVED_BY_UW,
      pipelineAccent: "contract-pending",
    },
    {
      label: operationsDashboardStatusTitle("On_Hold"),
      url: "/applications",
      icon: PauseCircle,
      underwriterPipeline: UNDERWRITER_PIPELINE_FILTERS.ON_HOLD,
      pipelineAccent: "on-hold",
    },
  ],
};

const finalUnderwriterSections: SidebarNavSection[] = [
  {
    title: "",
    items: [
      { label: "Dashboard", url: "/", icon: Dashboard },
      { label: "Notifications", url: "/notifications", icon: Notifications },
    ],
  },
  underwriterDealPipelineSection,
  {
    title: "COMMUNICATIONS",
    items: [{ label: "Team Chat", url: "/team-chat", icon: Chat }],
  },
  {
    title: "ACCOUNT",
    items: [{ label: "Settings", url: "/user-setting", icon: Settings }],
  },
];

const operationsSections: SidebarNavSection[] = [
  {
    title: "",
    items: [
      { label: "Overview", url: "/", icon: Dashboard },
      { label: "Notifications", url: "/notifications", icon: Notifications },
    ],
  },
  dealPipelineSection,
  {
    title: "OPERATIONS",
    items: [
      { label: "Reports", url: "/reports", icon: Description },
      { label: "Syndicators", url: "/syndicators/dashboard", icon: SyndicatorsSidebarIcon },
      { label: "ISO Portal", url: "/iso-portal", icon: BarChart },
      { label: "All Deals", url: "/payments", icon: Payments },
      { label: "Letters", url: "/letter-generator", icon: Mail },
    ],
  },
  {
    title: "COMMUNICATIONS",

    items: [{ label: "Team Chat", url: "/team-chat", icon: Chat }, { label: "Gmail", url: "/gmail", icon: Email }],
  },
  {
    title: "ACCOUNT",
    items: [{ label: "Settings", url: "/user-setting", icon: People }],
  },
];

const accountsSections: SidebarNavSection[] = [
  {
    title: "",
    items: [
      { label: "All Deals", url: "/payments", icon: Payments },
    ],
  },
];

const uwSections: SidebarNavSection[] = [
  {
    title: "",
    items: [
      { label: "Dashboard", url: "/", icon: Dashboard },
      { label: "Notifications", url: "/notifications", icon: Notifications },
      { label: "Clients", url: "/clients", icon: People },
      { label: "Submissions", url: "/applications", icon: InsertDriveFileIcon },
    ],
  },
  {
    title: "MY DEALS",
    items: [
      {
        label: "Approved",
        url: "/applications",
        icon: VerifiedUser,
        underwriterPipeline: UNDERWRITER_PIPELINE_FILTERS.SCRUBBER_APPROVED,
        pipelineAccent: "approved-by-uw",
      },
      {
        label: "Declined",
        url: "/applications",
        icon: HighlightOff,
        underwriterPipeline: UNDERWRITER_PIPELINE_FILTERS.SCRUBBER_DECLINED,
        pipelineAccent: "rejected",
      },
    ],
  },
  {
    title: "COMMUNICATIONS",
    items: [{ label: "Team Chat", url: "/team-chat", icon: Chat }],
  },
  {
    title: "ACCOUNT",
    items: [{ label: "Settings", url: "/user-setting", icon: Settings }],
  },
];

const syndicatorSections: SidebarNavSection[] = [
  {
    title: "",
    items: [{ label: "Dashboard", url: "/", icon: Dashboard }],
  },
  {
    title: "PORTFOLIO",
    items: [
      { label: "Payouts", url: "/syndicator-payouts", icon: People },
      { label: "Funding", url: "/syndicator-funding", icon: InsertDriveFileIcon },
      { label: "Portfolio", url: "/syndicator-portfolio", icon: PieChart },
    ],
  },
  {
    title: "ACCOUNT",
    items: [{ label: "Setting", url: "/user-setting", icon: People }],
  },
];

const adminSections: SidebarNavSection[] = [
  {
    title: "",
    items: [
      { label: "Dashboard", url: "/", icon: Dashboard },
      { label: "Submissions", url: "/applications", icon: InsertDriveFileIcon },
    ],
  },
  {
    title: "MANAGEMENT",
    items: [
      { label: "Agents", url: "/agents", icon: PersonIcon },
      { label: "Clients", url: "/clients", icon: People },
      { label: "Syndicators", url: "/syndicators/dashboard", icon: SyndicatorsSidebarIcon },
      { label: "Scrubbing", url: "/scrubbing", icon: ContentPasteSearchIcon },
      { label: "Underwriters", url: "/underwriters", icon: People },
      { label: "Person Lookup", url: "/person-lookup", icon: PersonSearchIcon },
    ],
  },
  {
    title: "REPORTS & COMMISSIONS",
    items: [
      { label: "ISO Portal", url: "/iso-portal", icon: BarChart },
      { label: "Reports", url: "/reports", icon: Description },
    ],
  },
  {
    title: "COMMUNICATIONS",
    items: [
      { label: "Team Chat", url: "/team-chat", icon: Chat },
      { label: "Gmail", url: "/gmail", icon: Email },
    ],
  },
  {
    title: "SYSTEM",
    items: [{ label: "Settings", url: "/user-setting", icon: Settings }],
  },
];


const notAApplicationPipelineItem: SidebarNavItem = {
  label: "Not A Submission",
  url: "/applications",
  operationsStatus: "Not_A_Application",
  icon: Block,
  pipelineAccent: "rejected",
};

/** Old deals that were never scrubbed, parked out of the live pipeline. */
const oldNotScrubbedPipelineItem: SidebarNavItem = {
  label: "Old - Not Scrubbed",
  url: "/applications",
  operationsStatus: "Old_Not_Scrubbed",
  icon: History,
  pipelineAccent: "rejected",
};

/** Deals a scrubber flagged as missing documents — Super Admin uploads and sends them back. */
const missingDocumentsPipelineItem: SidebarNavItem = {
  label: operationsDashboardStatusTitle("Missing_Documents"),
  url: "/applications",
  operationsStatus: "Missing_Documents",
  icon: FolderOff,
  pipelineAccent: "on-hold",
};

const superAdminDealPipelineSection: SidebarNavSection = {
  ...dealPipelineSection,
  items: [
    ...dealPipelineSection.items,
    missingDocumentsPipelineItem,
    notAApplicationPipelineItem,
    oldNotScrubbedPipelineItem,
  ],
};

const superAdminSections: SidebarNavSection[] = [
  {
    title: "",
    items: [
      { label: "Dashboard", url: "/", icon: Dashboard },
      { label: "Notifications", url: "/notifications", icon: Notifications },
      { label: "Clients", url: "/clients", icon: People },
    ],
  },
  superAdminDealPipelineSection,
  {
    title: "OPERATIONS",
    items: [
      {
        label: "User Management",
        url: "",
        icon: People,
        group: true,
        children: [
          { label: "Agents", url: "/agents", icon: PersonIcon },
          { label: "Scrubbing", url: "/scrubbing", icon: ContentPasteSearchIcon },
          { label: "Underwriters", url: "/underwriters", icon: People },
        ],
      },
      { label: "Syndicators", url: "/syndicators/dashboard", icon: SyndicatorsSidebarIcon },
      { label: "Person Lookup", url: "/person-lookup", icon: PersonSearchIcon },
      { label: "All Deals", url: "/payments", icon: Payments },
      { label: "Letters", url: "/letter-generator", icon: Mail },
      { label: "ISO Portal", url: "/iso-portal", icon: BarChart },
      { label: "Reports", url: "/reports", icon: Description },
    ],
  },
  {
    title: "COMMUNICATIONS",
    items: [
      { label: "Gmail", url: "/gmail", icon: Email },
      { label: "Team Chat", url: "/team-chat", icon: Chat },
    ],
  },
  {
    title: "ACCOUNT",
    items: [
      { label: "Invite Members", url: "/settings", icon: PersonAddAlt1Icon },
      { label: "Settings", url: "/user-setting", icon: Settings },
    ],
  },
];

function getRoleSections(role: string): SidebarNavSection[] {
  const key = normalizeRoleKey(role);
  switch (key) {
    case "ADMIN":
      return adminSections;
    case "AGENT":
      return agentSections;
    case "SYNDICATOR":
      return syndicatorSections;
    case "OPERATIONS":
      return operationsSections;
    case "UNDERWRITER":
      return finalUnderwriterSections;
    case "SCRUBBING":
      return uwSections;
    case "ACCOUNTS":
      return accountsSections;
    default:
      return agentSections;
  }
}

const Sidebar = () => {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  // The mobile sheet always shows the full sidebar; `state` tracks the desktop rail there.
  const isCollapsed = !isMobile && state === "collapsed";

  const { data } = useSelector((state: RootState) => state.login);
  const { data: notifications } = useSelector(
    (state: RootState) => state.notifications,
  );
  const operationsSummaryCounts = useSelector(
    (state: RootState) => state.operationsDashboard.summaryCounts,
  );
  const operationsCaseStageCounts = useSelector(
    (state: RootState) => state.operationsDashboard.caseStageCounts,
  );
  const rejectedApplicationCount = useSelector(
    (state: RootState) => state.applicationStats.data?.rejected?.count ?? 0,
  );
  const userRole = resolveEffectiveRole(data?.user);
  const normalizedRole = normalizeRoleKey(userRole);
  const dispatch: AppDispatch = useDispatch();
  const [underwriterPipelineCounts, setUnderwriterPipelineCounts] =
    useState<UnderwriterPipelineCounts | null>(null);
  const [declinePipelineCounts, setDeclinePipelineCounts] =
    useState<DeclinePipelineCounts | null>(null);
  const [notAApplicationCount, setNotAApplicationCount] = useState<
    number | null
  >(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(SIDEBAR_COLLAPSED_SECTIONS_KEY);
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });
  const toggleSection = (title: string) =>
    setCollapsedSections((prev) => {
      const next = { ...prev, [title]: !prev[title] };
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_SECTIONS_KEY, JSON.stringify(next));
      } catch {
        /* ignore storage failures (private mode / quota) */
      }
      return next;
    });

  useEffect(() => {
    if (normalizedRole !== "UNDERWRITER" && normalizedRole !== "SCRUBBING") {
      setUnderwriterPipelineCounts(null);
      registerUnderwriterPipelineCountsInvalidator(null);
      return;
    }

    let cancelled = false;
    const loadCounts = () => {
      void fetchUnderwriterPipelineCounts().then((data) => {
        if (!cancelled && data) {
          setUnderwriterPipelineCounts(data);
        }
      });
    };

    loadCounts();
    registerUnderwriterPipelineCountsInvalidator(loadCounts);

    const onFocus = () => loadCounts();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      registerUnderwriterPipelineCountsInvalidator(null);
      window.removeEventListener("focus", onFocus);
    };
  }, [normalizedRole, pathname]);

  const showDeclinePipelineCounts =
    isSuperAdminRole(userRole) ||
    normalizedRole === "UNDERWRITER" ||
    normalizedRole === "OPERATIONS";

  useEffect(() => {
    if (!showDeclinePipelineCounts) {
      setDeclinePipelineCounts(null);
      registerDeclinePipelineCountsInvalidator(null);
      return;
    }

    let cancelled = false;
    const loadCounts = () => {
      void fetchDeclinePipelineCounts().then((data) => {
        if (!cancelled && data) {
          setDeclinePipelineCounts(data);
        }
      });
    };

    loadCounts();
    registerDeclinePipelineCountsInvalidator(loadCounts);

    const onFocus = () => loadCounts();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      registerDeclinePipelineCountsInvalidator(null);
      window.removeEventListener("focus", onFocus);
    };
  }, [showDeclinePipelineCounts, pathname]);

  const showNotAApplicationCount = isSuperAdminRole(userRole);

  useEffect(() => {
    if (!showNotAApplicationCount) {
      setNotAApplicationCount(null);
      registerNotAApplicationCountInvalidator(null);
      return;
    }

    let cancelled = false;
    const loadCount = () => {
      void fetchNotAApplicationCount().then((count) => {
        if (!cancelled && count != null) {
          setNotAApplicationCount(count);
        }
      });
    };

    loadCount();
    registerNotAApplicationCountInvalidator(loadCount);

    const onFocus = () => loadCount();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      registerNotAApplicationCountInvalidator(null);
      window.removeEventListener("focus", onFocus);
    };
  }, [showNotAApplicationCount, pathname]);

  const unreadNotificationCount = useMemo(
    () =>
      notifications?.filter((n: Notification) => !n.isRead).length ?? 0,
    [notifications],
  );

  const sidebarSections: SidebarNavSection[] = normalizedRole === "SUPER_ADMIN"
    ? superAdminSections
    : getRoleSections(userRole);

  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      const res = await dispatch(logout()).unwrap();
      if (res?.success) {
        toast.success(res.message);
      } else {
        toast.error(res?.message || "Logout failed");
      }
    } catch (err: unknown) {
      const message =
        typeof err === "string" ? err : (err as any)?.message;
      toast.error(message || "Logout failed");
    } finally {
      // Always clear client-side auth state to prevent "stuck" sessions.
      dispatch(clearApplicationStats());
      dispatch(clearPaymentDashboard());
      dispatch(resetOperationsDashboard());
      dispatch(clearApplicationDetail());
      clearCrmCacheOnLogout();
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      localStorage.removeItem("role");
      clearVoiceMicSessionFlags();
      navigate("/login", { replace: true });
    }
  };

  const sidebarShell = isDark
    ? "bg-background border-r border-border"
    : "bg-sidebar border-r border-sidebar-border";

  const sectionHeadingClass =
    "mb-2 px-2 text-sm font-bold uppercase tracking-wider text-muted-foreground group-data-[collapsible=icon]:hidden";

  const mainSidebarTitleClass =
    "mt-3 text-xs font-bold uppercase tracking-wider text-muted-foreground group-data-[collapsible=icon]:hidden";

  const navHoverClass =
    "hover:text-primary hover:[&_svg]:text-primary hover:[&_*]:text-primary";

  const navButtonClass = isDark
    ? `w-full h-9 rounded-lg px-2 text-[15px] text-foreground/90 [&_svg]:text-foreground/90 hover:bg-sidebar-accent ${navHoverClass} data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:[&_svg]:text-sidebar-accent-foreground data-[active=true]:font-medium group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0`
    : `w-full h-9 rounded-lg px-2 text-[15px] text-muted-foreground [&_svg]:text-muted-foreground hover:bg-sidebar-accent/60 ${navHoverClass} data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground data-[active=true]:[&_svg]:text-sidebar-accent-foreground data-[active=true]:font-medium group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0`;

  const subNavButtonClass = `!h-auto min-h-8 items-center overflow-visible py-1.5 text-sm leading-snug [&>span:last-child]:truncate-none hover:bg-sidebar-accent/60 ${navHoverClass}`;

  const logoutButtonClass = isDark
    ? `w-full h-9 cursor-pointer rounded-lg px-2 text-foreground hover:bg-sidebar-accent [&_svg]:text-foreground ${navHoverClass}`
    : `w-full h-9 cursor-pointer rounded-lg px-2 text-muted-foreground hover:bg-sidebar-accent/60 [&_svg]:text-muted-foreground ${navHoverClass}`;

  return (
    <UISidebar collapsible="icon" side="left">

      <div
        className={`flex h-full min-h-0 flex-col ${sidebarShell}`}
        data-sidebar-scrollbar="default"
        onClick={(e) => {
          // On mobile the sidebar is an off-canvas sheet; close it after navigating.
          if (isMobile && (e.target as HTMLElement).closest("a")) {
            setOpenMobile(false);
          }
        }}
      >
        <SidebarHeader className="p-4 mt-5 pb-3 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-2">
          <div className="flex items-center justify-between">
            <div className="flex flex-col justify-center leading-tight">
              <img
                src={
                  isCollapsed
                    ? isDark
                      ? APP_SHORT_ICON_DARK_SRC
                      : APP_SHORT_ICON_SRC
                    : resolveAppLogoSrc(isDark)
                }
                alt="Company logo"
                className={`block object-contain ${isCollapsed ? "h-8 w-8 shrink-0" : "h-26 w-auto max-w-full"}`}
              />
            </div>
          </div>
          <p className={mainSidebarTitleClass}>Main</p>
        </SidebarHeader>
        <SidebarContent className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto px-2 pb-2 pt-0 group-data-[collapsible=icon]:overflow-auto group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0">
          <div className="w-full space-y-5 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:w-auto">
            {sidebarSections.map((section, sectionIndex) => {
              const sectionCollapsed =
                Boolean(section.title) && !isCollapsed && !!collapsedSections[section.title];
              return (
              <div
                key={`${section.title || "section"}-${sectionIndex}`}
                className="w-full"
              >
                {section.title ? (
                  <button
                    type="button"
                    onClick={() => toggleSection(section.title)}
                    aria-expanded={!sectionCollapsed}
                    className={cn(sectionHeadingClass, "flex w-full items-center justify-between gap-2 hover:text-foreground")}
                  >
                    <span>{section.title}</span>
                    <ExpandMore
                      sx={{ fontSize: "1rem" }}
                      className={cn("shrink-0 transition-transform duration-200", sectionCollapsed && "-rotate-90")}
                    />
                  </button>
                ) : null}
                {sectionCollapsed ? null : (
                <SidebarMenu className="flex flex-col items-stretch gap-0.5 group-data-[collapsible=icon]:items-center">
                  {section.items.map((item) => {
                    if (item.group) {
                      return (
                        <NavGroup
                          key={item.label}
                          item={item}
                          pathname={pathname}
                          navButtonClass={navButtonClass}
                          subNavButtonClass={subNavButtonClass}
                        />
                      );
                    }
                    const pipelineStatus = item.operationsStatus;
                    const underwriterClaim = item.underwriterClaim;
                    const underwriterPipeline = item.underwriterPipeline;
                    const underwriterPipelineCountKey =
                      item.underwriterPipelineCount ?? underwriterPipeline;
                    const childItems = item.children ?? [];
                    const hasChildren = childItems.length > 0;
                    const to = underwriterPipeline
                      ? buildUnderwriterPipelineApplicationsUrl({ underwriterPipeline })
                      : underwriterClaim
                      ? buildUnderwriterPipelineApplicationsUrl({ underwriterClaim })
                      : pipelineStatus != null && pipelineStatus !== ""
                        ? buildOperationsPipelineApplicationsUrl(pipelineStatus)
                        : item.url;
                    const isOperationsPipelineView =
                      pathname === "/applications" &&
                      searchParams.get("fromDashboard") === "operations" &&
                      Boolean(searchParams.get("operationsStatus"));
                    const isChildActive = hasChildren
                      ? childItems.some((child) =>
                          isOperationsPipelineItemActive(
                            pathname,
                            searchParams,
                            child.operationsStatus,
                          ),
                        )
                      : false;
                    const isActive = hasChildren
                      ? isChildActive ||
                        isOperationsPipelineItemActive(
                          pathname,
                          searchParams,
                          pipelineStatus,
                        )
                      : underwriterPipeline
                        ? isUnderwriterPipelineItemActive(
                            pathname,
                            searchParams,
                            underwriterPipeline,
                          )
                        : underwriterClaim
                        ? isUnderwriterClaimPipelineItemActive(
                            pathname,
                            searchParams,
                            underwriterClaim,
                          )
                        : pipelineStatus != null && pipelineStatus !== ""
                          ? isOperationsPipelineItemActive(
                              pathname,
                              searchParams,
                              pipelineStatus,
                            )
                          : !item.url || item.url === ""
                            ? false
                            : item.url === "/applications"
                              ? pathname === "/applications" &&
                                !isOperationsPipelineView &&
                                !searchParams.get("underwriterClaim") &&
                                !searchParams.get("underwriterPipeline")
                              : item.url === "/"
                                ? pathname === "/"
                                : pathname === item.url ||
                                  pathname.startsWith(`${item.url}/`);
                    const isNotificationsLink = item.url === "/notifications";
                    const showUnreadBadge =
                      isNotificationsLink && unreadNotificationCount > 0;
                    const badgeLabel =
                      unreadNotificationCount > 9
                        ? "9+"
                        : String(unreadNotificationCount);

                    if (hasChildren) {
                      return (
                        <SidebarMenuItem
                          key={item.label}
                          className="w-full group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center"
                        >
                          <SidebarMenuButton
                            asChild
                            isActive={isActive}
                            className={navButtonClass}
                          >
                            <Link
                              to={to}
                              className="flex w-full min-w-0 items-center gap-2 group-data-[collapsible=icon]:w-auto group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0"
                            >
                              <span className="relative shrink-0">
                                <NavIcon icon={item.icon} />
                              </span>
                              <span className="min-w-0 flex-1 truncate">
                                <span className="mr-1 opacity-70" aria-hidden>
                                  •
                                </span>
                                {item.label}
                              </span>
                            </Link>
                          </SidebarMenuButton>
                          <SidebarMenuSub className="mx-1.5 border-l px-2">
                            {childItems.map((child) => {
                              const childStatus = child.operationsStatus ?? "";
                              const childTo = buildOperationsPipelineApplicationsUrl(
                                childStatus,
                              );
                              const childActive = isOperationsPipelineItemActive(
                                pathname,
                                searchParams,
                                child.operationsStatus,
                              );
                              const declineChildCount =
                                resolveDeclinePipelineChildCount(
                                  child.operationsStatus,
                                  undefined,
                                  declinePipelineCounts,
                                );
                              const childCount =
                                declineChildCount ??
                                resolveApplicationsPipelineCount(
                                  child.operationsStatus,
                                  operationsSummaryCounts,
                                  operationsCaseStageCounts,
                                  rejectedApplicationCount,
                                );
                              const showChildCount =
                                childCount != null && childCount > 0;
                              const childCountLabel = String(childCount ?? "");
                              const actionHint = getSidebarPipelineActionHint(
                                childStatus,
                              );
                              const actionAccent = resolveSidebarPipelineActionAccent(
                                childStatus,
                              );

                              return (
                                <SidebarMenuSubItem key={child.label}>
                                  <SidebarMenuSubButton
                                    asChild
                                    isActive={childActive}
                                    size="md"
                                    className={cn(
                                      subNavButtonClass,
                                      actionHint && "py-2",
                                    )}
                                  >
                                    <Link
                                      to={childTo}
                                      className="flex w-full min-w-0 flex-col gap-1.5"
                                    >
                                      <span className="flex w-full items-center justify-between gap-2">
                                        <span className="min-w-0 flex-1 whitespace-nowrap text-sm">
                                          {child.label}
                                        </span>
                                        {showChildCount ? (
                                          <span
                                            className={cn(
                                              "shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums",
                                              getPipelineCountBadgeClass(),
                                            )}
                                            aria-label={`${childCount} applications in ${child.label}`}
                                          >
                                            {childCountLabel}
                                          </span>
                                        ) : null}
                                      </span>
                                      {actionHint && actionAccent ? (
                                        <SidebarPipelineActionBadge accent={actionAccent}>
                                          {actionHint}
                                        </SidebarPipelineActionBadge>
                                      ) : null}
                                    </Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              );
                            })}
                          </SidebarMenuSub>
                        </SidebarMenuItem>
                      );
                    }

                    const isPipelineItem =
                      (pipelineStatus != null && pipelineStatus !== "") ||
                      Boolean(underwriterPipelineCountKey);
                    const pipelineCount = underwriterPipelineCountKey
                      ? resolveUnderwriterSidebarPipelineCount(
                          underwriterPipelineCountKey,
                          underwriterPipelineCounts,
                        )
                      : pipelineStatus === "Not_A_Application" &&
                          notAApplicationCount != null
                        ? notAApplicationCount
                        : resolveDeclinePipelineChildCount(
                            pipelineStatus,
                            undefined,
                            declinePipelineCounts,
                          ) ??
                          resolveApplicationsPipelineCount(
                            pipelineStatus,
                            operationsSummaryCounts,
                            operationsCaseStageCounts,
                            rejectedApplicationCount,
                          );
                    const showPipelineCount = pipelineCount != null;
                    const pipelineCountLabel = String(pipelineCount ?? "");

                    return (
                      <SidebarMenuItem key={item.label} className="w-full group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          className={cn(
                            isNotificationsLink
                              ? `${navButtonClass} overflow-visible [&>span:last-child]:truncate-none data-[active=true]:text-white data-[active=true]:[&_svg]:text-white`
                              : navButtonClass,
                            isPipelineItem
                              ? "!h-auto min-h-9 items-center overflow-visible py-1.5 leading-snug [&>span:last-child]:truncate-none"
                              : undefined,
                          )}
                        >
                          <Link
                            to={to}
                            className={cn(
                              "flex w-full min-w-0 gap-2 group-data-[collapsible=icon]:w-auto group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0",
                              isPipelineItem ? "items-start" : "items-center",
                            )}
                          >
                            <span className="relative shrink-0">
                              <NavIcon icon={item.icon} />
                              {showUnreadBadge && isCollapsed ? (
                                <span
                                  className="absolute -right-1 -top-0.5 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-0.5 text-[10px] font-bold leading-none !text-white shadow-sm"
                                  aria-hidden
                                >
                                  {badgeLabel}
                                </span>
                              ) : null}
                            </span>
                            {isNotificationsLink ? (
                              <span className="flex min-w-0 flex-1 items-center gap-2">
                                <span className="min-w-0 flex-1 truncate">
                                  {item.label}
                                </span>
                                {showUnreadBadge && !isCollapsed ? (
                                  <span
                                    className="shrink-0 rounded-full bg-destructive px-1.5 py-0.5 text-[13px] font-semibold leading-none !text-white tabular-nums"
                                    aria-label={`${unreadNotificationCount} unread notifications`}
                                  >
                                    {badgeLabel}
                                  </span>
                                ) : null}
                              </span>
                            ) : isPipelineItem ? (
                              <span className="flex min-w-0 flex-1 items-start justify-between gap-2">
                                <span className="min-w-0 flex-1 text-sm leading-snug">
                                  {item.label}
                                </span>
                                {showPipelineCount ? (
                                  <span
                                    className={cn(
                                      "shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums",
                                      getPipelineCountBadgeClass(),
                                    )}
                                    aria-label={`${pipelineCount} applications in ${item.label}`}
                                  >
                                    {pipelineCountLabel}
                                  </span>
                                ) : null}
                              </span>
                            ) : (
                              <span className="min-w-0 flex-1 truncate">
                                {item.label}
                              </span>
                            )}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
                )}
              </div>
              );
            })}
          </div>
        </SidebarContent>
        <SidebarFooter className="mt-auto p-4 pt-2">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton

                  onClick={handleLogout}
                  className={logoutButtonClass}
                >
                  <Logout sx={navIconSx} />
                  <span>Logout</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarFooter>
      </div>
    </UISidebar>
  );
}

export default Sidebar;
