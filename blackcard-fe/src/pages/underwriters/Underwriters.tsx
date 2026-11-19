import { useEffect, useState } from "react";
import { useDispatch, useSelector, shallowEqual } from "react-redux";
// import {
//   AreaChart,
//   Area,
//   XAxis,
//   YAxis,
//   CartesianGrid,
//   Tooltip,
//   ResponsiveContainer,
//   PieChart,
//   Pie,
//   Cell,
// } from "recharts";


import {
  // UserPlus,
  Search,
  UserPlus,
  Trash2,
  Pencil,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  MoreHorizontal,
  Download,
  Filter,
} from "lucide-react";
import { toast } from "react-toastify";
import { useTheme } from "@/context/ThemeContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  fetchUsersByRole,
  createUser,
  deleteUser,
  updateUser,
} from "@/redux/actions/settingsUserActions";
import {
  selectUsersByRole,
  selectUsersLoadingByRole,
} from "@/redux/selectors/settingsUsersSelectors";
import type { AppDispatch, RootState } from "@/redux/store";
import type { User } from "@/types/userTypes";
// import axios from 'axios';
import { axiosPost } from "@/redux/axios";
import { useNavigate } from "react-router";
import { formatDate as formatDateUtil } from "@/lib/utils";
import { formatUSPhoneNumber, handleUSPhoneInputChange } from "@/utils/formatPhoneNumber";

const ROLE_ID = "SCRUBBING";
const LABEL = "Scrubbing";
const LABEL_PLURAL = "Scrubbing";

function formatDate(dateStr: string | undefined): string {
  return formatDateUtil(dateStr ?? "", "—");
}

// Mock trend data for the professional graph
// const trendData = [
//   { month: 'Oct', underwriters: 12 }, { month: 'Nov', underwriters: 15 },
//   { month: 'Dec', underwriters: 14 }, { month: 'Jan', underwriters: 18 },
//   { month: 'Feb', underwriters: 22 }, { month: 'Mar', underwriters: 25 },
// ];

export default function UnderwritersDashboard() {
  const dispatch = useDispatch<AppDispatch>();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const navigate = useNavigate();
  const users: User[] = useSelector(
    (state: RootState) => selectUsersByRole(state, ROLE_ID),
    shallowEqual,
  );
  const loading = useSelector((state: RootState) =>
    selectUsersLoadingByRole(state, ROLE_ID),
  );

  // --- Dashboard States ---
  const [search, setSearch] = useState("");

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<User | null>(null);

  // Add / Edit form state
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);

  useEffect(() => {
    dispatch(fetchUsersByRole(ROLE_ID));
  }, [dispatch]);

  // --- Derived Metrics for Dashboard Cards ---
  // const stats = useMemo(() => ({
  //   total: users.length,
  //   active: users.filter(u => u.isActive).length,
  //   inactive: users.filter(u => !u.isActive).length,
  //   growth: "+8%" // Placeholder for real trend logic
  // }), [users]);

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    const name = `${u.firstName} ${u.lastName}`.toLowerCase();
    return name.includes(q) || u.email?.toLowerCase().includes(q);
  });

  const handleLoginAsUW = async (userId: string) => {
    try {
      const token = localStorage.getItem("token");

      const res = await axiosPost(
        "/users/impersonate",
        { userId },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const { token: newToken, user } = res.data;
      console.log(res.data);

      localStorage.setItem("token", newToken);
      localStorage.setItem("user", JSON.stringify(user));
      localStorage.setItem("role", user.role);

      toast.success("Logged in as Scrubbing");

      navigate("/");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Impersonation failed");
    }
  };

  // --- Add ---
  const openAddModal = () => {
    setFormName("");
    setFormEmail("");
    setFormPhone("");
    setFormPassword("");
    setAddModalOpen(true);
  };

  const handleAdd = async () => {
    if (!formName.trim() || !formEmail.trim() || !formPassword.trim()) {
      toast.error("Name, Email and Password are required");
      return;
    }

    setFormSubmitting(true);
    try {
      await dispatch(
        createUser({
          name: formName.trim(),
          email: formEmail.trim().toLowerCase(),
          phone: formPhone.trim() || undefined,
          password: formPassword,
          role: ROLE_ID,
        }),
      ).unwrap();

      toast.success("Scrubbing created successfully");
      setAddModalOpen(false);
      dispatch(fetchUsersByRole(ROLE_ID));
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to create scrubbing");
    } finally {
      setFormSubmitting(false);
    }
  };

  // --- Edit ---
  const openEditModal = (user: User) => {
    setEditUser(user);
    setFormName([user.firstName, user.lastName].filter(Boolean).join(" "));
    setFormEmail(user.email || "");
    setFormPhone(user.phone ?? "");
    setFormPassword("");
  };

  const handleEdit = async () => {
    if (!editUser) return;

    setFormSubmitting(true);
    try {
      const nameParts = formName.trim().split(/\s+/);
      await dispatch(
        updateUser({
          id: editUser._id,
          firstName: nameParts[0] ?? "",
          lastName: nameParts.slice(1).join(" ") || "",
          email: formEmail.trim().toLowerCase(),
          phone: formPhone.trim() || undefined,
        }),
      ).unwrap();

      toast.success("Scrubbing updated successfully");
      setEditUser(null);
      dispatch(fetchUsersByRole(ROLE_ID));
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update scrubbing");
    } finally {
      setFormSubmitting(false);
    }
  };

  // --- Delete ---
  const handleDelete = async () => {
    if (!deleteConfirm) return;

    setFormSubmitting(true);
    try {
      await dispatch(
        deleteUser({
          roleId: ROLE_ID,
          userId: deleteConfirm._id,
          user: deleteConfirm,
        }),
      ).unwrap();

      toast.success("Scrubbing deleted");
      setDeleteConfirm(null);
      dispatch(fetchUsersByRole(ROLE_ID));
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to delete scrubbing");
    } finally {
      setFormSubmitting(false);
    }
  };

  // --- Professional Styling ---
  const cardBg = isDark
    ? "bg-[#111827] border border-[#1f2937]"
    : "bg-white border border-[#E5E7EB]";
  const textMuted = isDark ? "text-slate-400" : "text-slate-500";

  const activeCount = users.filter((u) => u.isActive).length;
  const inactiveCount = users.length - activeCount;

  return (
    <div
      className={`min-h-screen flex flex-col ${isDark ? "bg-[#141517] text-white" : "bg-background text-[#111827]"
        }`}
    >
      {/* Header */}
      <header className="px-4 md:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">All {LABEL_PLURAL}</h1>
          <p className={`text-xs ${textMuted}`}>
            Monitor underwriting capacity and manage user access permissions.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" className="gap-2 border-inherit">
            <Download size={16} /> Audit Log
          </Button>
          <Button
            onClick={openAddModal}
            className="bg-[image:var(--brand-gradient)] hover:opacity-90 text-white text-xs font-medium px-4 h-9 rounded-lg gap-1.5"
          >
            <UserPlus className="h-4 w-4" />
            New {LABEL_PLURAL}
          </Button>
        </div>
      </header>

      {/* Statistics Cards */}
      <div className="px-6 py-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <div
          className={`rounded-lg p-4 border shadow-sm flex flex-col justify-between ${isDark ? "bg-[#1a1b1e] border-gray-800" : "bg-white border-gray-200"
            }`}
        >
          <div className="flex justify-between items-start">
            <span className="text-gray-500 text-xs font-medium">Funded</span>
            <div className="bg-green-100 p-1.5 rounded-full">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
            </div>
          </div>
          <div className="mt-1">
            <h3 className={`text-2xl font-bold ${isDark ? "text-white" : "text-[#111827]"}`}>
              {users.length}
            </h3>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-gray-500 text-[10px]">in last 7 days</span>
            <span className={`text-md font-semibold ${isDark ? "text-white" : "text-[#111827]"}`}>
              $0.00
            </span>
          </div>
        </div>

        <div
          className={`rounded-lg p-4 border shadow-sm flex flex-col justify-between ${isDark ? "bg-[#1a1b1e] border-gray-800" : "bg-white border-gray-200"
            }`}
        >
          <div className="flex justify-between items-start">
            <span className="text-gray-500 text-xs font-medium">Approved</span>
            <div className="bg-blue-100 p-1.5 rounded-full">
              <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" />
            </div>
          </div>
          <div className="mt-1">
            <h3 className={`text-2xl font-bold ${isDark ? "text-white" : "text-[#111827]"}`}>
              {activeCount}
            </h3>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-gray-500 text-[10px]">in last 7 days</span>
            <span className={`text-md font-semibold ${isDark ? "text-white" : "text-[#111827]"}`}>
              $0.00
            </span>
          </div>
        </div>

        <div
          className={`rounded-lg p-4 border shadow-sm flex flex-col justify-between ${isDark ? "bg-[#1a1b1e] border-gray-800" : "bg-white border-gray-200"
            }`}
        >
          <div className="flex justify-between items-start">
            <span className="text-gray-500 text-xs font-medium">Rejected</span>
            <div className="bg-red-100 p-1.5 rounded-full">
              <XCircle className="h-3.5 w-3.5 text-red-600" />
            </div>
          </div>
          <div className="mt-1">
            <h3 className={`text-2xl font-bold ${isDark ? "text-white" : "text-[#111827]"}`}>
              {inactiveCount}
            </h3>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-gray-500 text-[10px]">in last 7 days</span>
            <span className={`text-md font-semibold ${isDark ? "text-white" : "text-[#111827]"}`}>
              $0.00
            </span>
          </div>
        </div>

        <div
          className={`rounded-lg p-4 border shadow-sm flex flex-col justify-between ${isDark ? "bg-[#1a1b1e] border-gray-800" : "bg-white border-gray-200"
            }`}
        >
          <div className="flex justify-between items-start">
            <span className="text-gray-500 text-xs font-medium">Pending</span>
            <div className="bg-blue-100 p-1.5 rounded-full">
              <Clock className="h-3.5 w-3.5 text-blue-600" />
            </div>
          </div>
          <div className="mt-1">
            <h3 className={`text-2xl font-bold ${isDark ? "text-white" : "text-[#111827]"}`}>
              {0}
            </h3>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-gray-500 text-[10px]">in last 7 days</span>
            <span className={`text-md font-semibold ${isDark ? "text-white" : "text-[#111827]"}`}>
              $0.00
            </span>
          </div>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="px-6 py-4 flex items-center gap-4">
        <Button
          variant="outline"
          className="border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-medium px-4 h-9 rounded-lg gap-2"
        >
          <Filter className="h-4 w-4" />
          All
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M3 4.5L6 7.5L9 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Button>

        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by name, email, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`pl-9 h-9 text-xs ${isDark ? "bg-[#1a1b1e] border-gray-700" : "bg-white border-gray-300"
              }`}
          />
        </div>
      </div>

      {/* Table */}
      <section className={`mx-6 mt-4 mb-6 rounded-xl overflow-hidden ${cardBg}`}>
        {loading ? (
          <div className="p-10 text-center text-sm opacity-60">
            Loading {LABEL_PLURAL.toLowerCase()}...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm opacity-60">
            {search
              ? `No ${LABEL_PLURAL.toLowerCase()} match your search.`
              : `No ${LABEL_PLURAL.toLowerCase()} found.`}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow
                  className={`${isDark
                    ? "bg-[#1e293b] hover:bg-[#1e293b]"
                    : "bg-[image:var(--brand-gradient)] hover:bg-[image:var(--brand-gradient)]"} border-b-0`}
                >
                  <TableHead className="text-white font-medium text-xs w-[40px] px-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 accent-[var(--brand)] cursor-pointer"
                    />
                  </TableHead>
                  <TableHead className="text-white font-medium text-xs">
                    NAME
                  </TableHead>
                  <TableHead className="text-white font-medium text-xs">
                    EMAIL
                  </TableHead>
                  <TableHead className="text-white font-medium text-xs">
                    PHONE
                  </TableHead>
                  <TableHead className="text-white font-medium text-xs">
                    STATUS
                  </TableHead>
                  <TableHead className="text-white font-medium text-xs">
                    CREATED
                  </TableHead>
                  <TableHead className="text-white font-medium text-xs text-left">
                    ACTIONS
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filtered.map((u) => {
                  const id = u._id ?? (u as any).id;
                  const name =
                    [u.firstName, u.lastName].filter(Boolean).join(" ") || "—";

                  return (
                    <TableRow
                      key={id}
                      className={`${isDark
                        ? "border-b border-[#1f2937] hover:bg-[#1a2332]"
                        : "border-b border-[#E5E7EB] hover:bg-[#f9fafb]"}`}
                    >
                      <TableCell className="w-[40px] px-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 accent-[var(--brand)] cursor-pointer"
                        />
                      </TableCell>
                      <TableCell className="font-medium text-sm">{name}</TableCell>
                      <TableCell className="text-sm opacity-80">
                        {u.email}
                      </TableCell>
                      <TableCell className="text-sm opacity-80">
                        {u.phone ? formatUSPhoneNumber(u.phone) : "—"}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${u.isActive
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            }`}
                        >
                          {u.isActive ? "Active" : "Inactive"}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm opacity-80">
                        {formatDate(u.createdAt)}
                      </TableCell>
                      <TableCell className="text-left">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal size={16} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => handleLoginAsUW(u._id)}
                              className="gap-2"
                            >
                              <ShieldCheck size={14} /> Login as UW
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onClick={() => openEditModal(u)}
                              className="gap-2"
                            >
                              <Pencil size={14} /> Edit Profile
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onClick={() => setDeleteConfirm(u)}
                              className="text-red-500 gap-2"
                            >
                              <Trash2 size={14} /> Revoke Access
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Footer count */}
        <div
          className={`px-4 py-2.5 text-[11px] border-t ${isDark
            ? "bg-[#0f172a] border-[#1f2937]"
            : "bg-[#F9FAFB] border-[#E5E7EB]"
            }`}
        >
          <span className="opacity-60">
            {filtered.length}{" "}
            {filtered.length === 1
              ? "scrubbing user"
              : "scrubbing users"}
          </span>
        </div>
      </section>

      {/* Add Scrubbing Modal */}
      <Dialog
        open={addModalOpen}
        onOpenChange={(o: boolean) => !o && setAddModalOpen(false)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add {LABEL}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input
                placeholder="Enter full name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                placeholder="Enter email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Phone</Label>
              <Input
                type="tel"
                placeholder="(XXX) XXX-XXXX"
                value={formatUSPhoneNumber(formPhone)}
                onChange={(e) => handleUSPhoneInputChange(e, setFormPhone)}
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Password</Label>
              <Input
                type="password"
                placeholder="Min 6 characters"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0 mt-2">
            <Button
              variant="outline"
              onClick={() => setAddModalOpen(false)}
              disabled={formSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={formSubmitting}>
              {formSubmitting ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Scrubbing Modal */}
      <Dialog
        open={!!editUser}
        onOpenChange={(o: boolean) => !o && setEditUser(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit {LABEL}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input
                placeholder="Enter full name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                placeholder="Enter email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Phone</Label>
              <Input
                type="tel"
                placeholder="(XXX) XXX-XXXX"
                value={formatUSPhoneNumber(formPhone)}
                onChange={(e) => handleUSPhoneInputChange(e, setFormPhone)}
                inputMode="numeric"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0 mt-2">
            <Button
              variant="outline"
              onClick={() => setEditUser(null)}
              disabled={formSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={formSubmitting}>
              {formSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Scrubbing Modal */}
      <Dialog
        open={!!deleteConfirm}
        onOpenChange={(o: boolean) => !o && setDeleteConfirm(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {LABEL}</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Are you sure you want to delete{" "}
            <span className="font-semibold">
              {deleteConfirm
                ? [deleteConfirm.firstName, deleteConfirm.lastName]
                  .filter(Boolean)
                  .join(" ")
                : ""}
            </span>
            ? This action cannot be undone.
          </p>
          <DialogFooter className="gap-2 sm:gap-0 mt-2">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirm(null)}
              disabled={formSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={formSubmitting}
            >
              {formSubmitting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
