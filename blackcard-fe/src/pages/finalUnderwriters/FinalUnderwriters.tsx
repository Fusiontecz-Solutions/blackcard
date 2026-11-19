// import { useEffect, useState } from 'react';
// import { useDispatch, useSelector } from 'react-redux';
// import { shallowEqual } from 'react-redux';
// import { UserPlus, Search, Trash2, Pencil } from 'lucide-react';
// import { toast } from 'react-toastify';
// import { useTheme } from '@/context/ThemeContext';
// import { Button } from '@/components/ui/button';
// import { Input } from '@/components/ui/input';
// import {
//   Table,
//   TableBody,
//   TableCell,
//   TableHead,
//   TableHeader,
//   TableRow,
// } from '@/components/ui/table';
// import {
//   Dialog,
//   DialogContent,
//   DialogHeader,
//   DialogTitle,
//   DialogFooter,
// } from '@/components/ui/dialog';
// import { Label } from '@/components/ui/label';
// import {
//   fetchUsersByRole,
//   createUser,
//   deleteUser,
//   updateUser,
// } from '@/redux/actions/settingsUserActions';
// import { selectUsersByRole, selectUsersLoadingByRole } from '@/redux/selectors/settingsUsersSelectors';
// import type { AppDispatch, RootState } from '@/redux/store';
// import type { User } from '@/types/userTypes';

// const ROLE_ID = 'UNDERWRITER';
// const LABEL = 'Underwriter';
// const LABEL_PLURAL = 'Final Underwriters';

// function formatDate(dateStr: string | undefined): string {
//   if (!dateStr) return '—';
//   try {
//     return new Date(dateStr).toLocaleDateString(undefined, {
//       year: 'numeric',
//       month: 'short',
//       day: 'numeric',
//     });
//   } catch {
//     return '—';
//   }
// }

// export default function FinalUnderwriters() {
//   const dispatch = useDispatch<AppDispatch>();
//   const { resolvedTheme } = useTheme();
//   const isDark = resolvedTheme === 'dark';

//   const users: User[] = useSelector(
//     (state: RootState) => selectUsersByRole(state, ROLE_ID),
//     shallowEqual,
//   );
//   const loading = useSelector((state: RootState) =>
//     selectUsersLoadingByRole(state, ROLE_ID),
//   );

//   const [search, setSearch] = useState('');
//   const [addModalOpen, setAddModalOpen] = useState(false);
//   const [editUser, setEditUser] = useState<User | null>(null);
//   const [deleteConfirm, setDeleteConfirm] = useState<User | null>(null);

//   const [formName, setFormName] = useState('');
//   const [formEmail, setFormEmail] = useState('');
//   const [formPhone, setFormPhone] = useState('');
//   const [formPassword, setFormPassword] = useState('');
//   const [formSubmitting, setFormSubmitting] = useState(false);

//   useEffect(() => {
//     dispatch(fetchUsersByRole(ROLE_ID));
//   }, [dispatch]);

//   const filtered = users.filter((u) => {
//     if (!search.trim()) return true;
//     const q = search.toLowerCase();
//     const name = [u.firstName, u.lastName].filter(Boolean).join(' ').toLowerCase();
//     return (
//       name.includes(q) ||
//       u.email?.toLowerCase().includes(q) ||
//       u.phone?.toLowerCase().includes(q)
//     );
//   });

//   // --- Add ---
//   const openAddModal = () => {
//     setFormName('');
//     setFormEmail('');
//     setFormPhone('');
//     setFormPassword('');
//     setAddModalOpen(true);
//   };

//   const handleAdd = async () => {
//     if (!formName.trim() || !formEmail.trim() || !formPassword.trim()) {
//       toast.error('Name, Email and Password are required');
//       return;
//     }
//     setFormSubmitting(true);
//     try {
//       await dispatch(
//         createUser({
//           name: formName.trim(),
//           email: formEmail.trim().toLowerCase(),
//           phone: formPhone.trim() || undefined,
//           password: formPassword,
//           role: ROLE_ID,
//         }),
//       ).unwrap();
//       toast.success(`${LABEL} created successfully`);
//       setAddModalOpen(false);
//     } catch (err: any) {
//       toast.error(err?.message ?? `Failed to create ${LABEL.toLowerCase()}`);
//     } finally {
//       setFormSubmitting(false);
//     }
//   };

//   // --- Edit ---
//   const openEditModal = (user: User) => {
//     setEditUser(user);
//     setFormName([user.firstName, user.lastName].filter(Boolean).join(' '));
//     setFormEmail(user.email);
//     setFormPhone(user.phone ?? '');
//     setFormPassword('');
//   };

//   const handleEdit = async () => {
//     if (!editUser) return;
//     setFormSubmitting(true);
//     try {
//       const nameParts = formName.trim().split(/\s+/);
//       await dispatch(
//         updateUser({
//           id: editUser._id,
//           firstName: nameParts[0] ?? '',
//           lastName: nameParts.slice(1).join(' ') || '',
//           email: formEmail.trim().toLowerCase(),
//           phone: formPhone.trim() || undefined,
//         }),
//       ).unwrap();
//       toast.success(`${LABEL} updated successfully`);
//       setEditUser(null);
//       dispatch(fetchUsersByRole(ROLE_ID));
//     } catch (err: any) {
//       toast.error(err?.message ?? `Failed to update ${LABEL.toLowerCase()}`);
//     } finally {
//       setFormSubmitting(false);
//     }
//   };

//   // --- Delete ---
//   const handleDelete = async () => {
//     if (!deleteConfirm) return;
//     try {
//       await dispatch(
//         deleteUser({
//           roleId: ROLE_ID,
//           userId: deleteConfirm._id,
//           user: deleteConfirm,
//         }),
//       ).unwrap();
//       toast.success(`${LABEL} deleted`);
//     } catch (err: any) {
//       toast.error(err?.message ?? `Failed to delete ${LABEL.toLowerCase()}`);
//     } finally {
//       setDeleteConfirm(null);
//     }
//   };

//   const cardBg = isDark
//     ? 'bg-[#111827] border border-[#1f2937]'
//     : 'bg-white border border-[#E5E7EB]';

//   const inputClass = isDark
//     ? 'bg-[#1f2937] border-[#374151] text-white placeholder:text-gray-500'
//     : 'bg-white border-[#D1D5DB] text-[#111827] placeholder:text-gray-400';

//   return (
//     <div
//       className={`min-h-screen flex flex-col ${
//         isDark ? 'bg-[#141517] text-white' : 'bg-background text-[#111827]'
//       }`}
//     >
//       {/* Header */}
//       <header
//         className={`px-6 py-3 border-b flex items-center justify-between ${
//           isDark ? 'border-[#1f2937]' : 'border-[#E5E7EB]'
//         }`}
//       >
//         <h1 className="text-lg font-semibold">{LABEL_PLURAL}</h1>
//         <Button
//           onClick={openAddModal}
//           className="bg-[image:var(--brand-gradient)] hover:opacity-90 text-white text-xs font-medium px-4 h-9 rounded-lg gap-1.5"
//         >
//           <UserPlus className="h-4 w-4" />
//           Add {LABEL}
//         </Button>
//       </header>

//       {/* Search bar */}
//       <div className="px-6 pt-4">
//         <div className="relative max-w-sm">
//           <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-50" />
//           <Input
//             placeholder={`Search ${LABEL_PLURAL.toLowerCase()}...`}
//             value={search}
//             onChange={(e) => setSearch(e.target.value)}
//             className={`pl-9 h-9 text-xs ${inputClass}`}
//           />
//         </div>
//       </div>

//       {/* Table */}
//       <section className={`mx-6 mt-4 mb-6 rounded-xl overflow-hidden ${cardBg}`}>
//         {loading ? (
//           <div className="p-10 text-center text-sm opacity-60">Loading {LABEL_PLURAL.toLowerCase()}...</div>
//         ) : filtered.length === 0 ? (
//           <div className="p-10 text-center text-sm opacity-60">
//             {search ? `No ${LABEL_PLURAL.toLowerCase()} match your search.` : `No ${LABEL_PLURAL.toLowerCase()} found.`}
//           </div>
//         ) : (
//           <div className="overflow-x-auto">
//             <Table>
//               <TableHeader>
//                 <TableRow
//                   className={`${
//                     isDark
//                       ? 'bg-[#1e293b] hover:bg-[#1e293b]'
//                       : 'bg-[image:var(--brand-gradient)] hover:bg-[image:var(--brand-gradient)]'
//                   } border-b-0`}
//                 >
//                   <TableHead className="text-white font-medium text-xs">NAME</TableHead>
//                   <TableHead className="text-white font-medium text-xs">EMAIL</TableHead>
//                   <TableHead className="text-white font-medium text-xs">PHONE</TableHead>
//                   <TableHead className="text-white font-medium text-xs">STATUS</TableHead>
//                   <TableHead className="text-white font-medium text-xs">CREATED</TableHead>
//                   <TableHead className="text-white font-medium text-xs text-left">ACTIONS</TableHead>
//                 </TableRow>
//               </TableHeader>
//               <TableBody>
//                 {filtered.map((user) => {
//                   const id = user._id ?? (user as any).id;
//                   const name =
//                     [user.firstName, user.lastName].filter(Boolean).join(' ') || '—';
//                   return (
//                     <TableRow
//                       key={id}
//                       className={`${
//                         isDark
//                           ? 'border-b border-[#1f2937] hover:bg-[#1a2332]'
//                           : 'border-b border-[#E5E7EB] hover:bg-[#f9fafb]'
//                       }`}
//                     >
//                       <TableCell className="font-medium text-sm">{name}</TableCell>
//                       <TableCell className="text-sm opacity-80">{user.email}</TableCell>
//                       <TableCell className="text-sm opacity-80">{user.phone ?? '—'}</TableCell>
//                       <TableCell>
//                         <span
//                           className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
//                             user.isActive
//                               ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
//                               : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
//                           }`}
//                         >
//                           {user.isActive ? 'Active' : 'Inactive'}
//                         </span>
//                       </TableCell>
//                       <TableCell className="text-sm opacity-80">
//                         {formatDate(user.createdAt)}
//                       </TableCell>
//                       <TableCell className="text-left">
//                         <div className="flex items-center justify-end gap-1">
//                           <button
//                             onClick={() => openEditModal(user)}
//                             className="p-1.5 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
//                             title="Edit"
//                           >
//                             <Pencil className="h-4 w-4 text-blue-600 dark:text-blue-400" />
//                           </button>
//                           <button
//                             onClick={() => setDeleteConfirm(user)}
//                             className="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
//                             title="Delete"
//                           >
//                             <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
//                           </button>
//                         </div>
//                       </TableCell>
//                     </TableRow>
//                   );
//                 })}
//               </TableBody>
//             </Table>
//           </div>
//         )}

//         <div
//           className={`px-4 py-2.5 text-[11px] border-t ${
//             isDark ? 'bg-[#0f172a] border-[#1f2937]' : 'bg-[#F9FAFB] border-[#E5E7EB]'
//           }`}
//         >
//           <span className="opacity-60">
//             {filtered.length} {filtered.length === 1 ? LABEL.toLowerCase() : LABEL_PLURAL.toLowerCase()}
//           </span>
//         </div>
//       </section>

//       {/* ──── ADD MODAL ──── */}
//       <Dialog open={addModalOpen} onOpenChange={(o) => !o && setAddModalOpen(false)}>
//         <DialogContent className="sm:max-w-md">
//           <DialogHeader>
//             <DialogTitle>Add {LABEL}</DialogTitle>
//           </DialogHeader>
//           <div className="space-y-4">
//             <div className="space-y-1.5">
//               <Label className="text-xs">Name</Label>
//               <Input placeholder="Enter full name" value={formName} onChange={(e) => setFormName(e.target.value)} />
//             </div>
//             <div className="space-y-1.5">
//               <Label className="text-xs">Email</Label>
//               <Input type="email" placeholder="Enter email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} />
//             </div>
//             <div className="space-y-1.5">
//               <Label className="text-xs">Phone</Label>
//               <Input type="tel" placeholder="Enter phone number" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} />
//             </div>
//             <div className="space-y-1.5">
//               <Label className="text-xs">Password</Label>
//               <Input type="password" placeholder="Min 6 characters" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} />
//             </div>
//           </div>
//           <DialogFooter className="gap-2 sm:gap-0 mt-2">
//             <Button variant="outline" onClick={() => setAddModalOpen(false)} disabled={formSubmitting}>Cancel</Button>
//             <Button onClick={handleAdd} disabled={formSubmitting}>{formSubmitting ? 'Creating...' : 'Create'}</Button>
//           </DialogFooter>
//         </DialogContent>
//       </Dialog>

//       {/* ──── EDIT MODAL ──── */}
//       <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
//         <DialogContent className="sm:max-w-md">
//           <DialogHeader>
//             <DialogTitle>Edit {LABEL}</DialogTitle>
//           </DialogHeader>
//           <div className="space-y-4">
//             <div className="space-y-1.5">
//               <Label className="text-xs">Name</Label>
//               <Input placeholder="Enter full name" value={formName} onChange={(e) => setFormName(e.target.value)} />
//             </div>
//             <div className="space-y-1.5">
//               <Label className="text-xs">Email</Label>
//               <Input type="email" placeholder="Enter email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} />
//             </div>
//             <div className="space-y-1.5">
//               <Label className="text-xs">Phone</Label>
//               <Input type="tel" placeholder="Enter phone number" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} />
//             </div>
//           </div>
//           <DialogFooter className="gap-2 sm:gap-0 mt-2">
//             <Button variant="outline" onClick={() => setEditUser(null)} disabled={formSubmitting}>Cancel</Button>
//             <Button onClick={handleEdit} disabled={formSubmitting}>{formSubmitting ? 'Saving...' : 'Save Changes'}</Button>
//           </DialogFooter>
//         </DialogContent>
//       </Dialog>

//       {/* ──── DELETE CONFIRMATION ──── */}
//       <Dialog open={!!deleteConfirm} onOpenChange={(o) => !o && setDeleteConfirm(null)}>
//         <DialogContent className="sm:max-w-sm">
//           <DialogHeader>
//             <DialogTitle>Delete {LABEL}</DialogTitle>
//           </DialogHeader>
//           <p className="text-sm">
//             Are you sure you want to delete{' '}
//             <span className="font-semibold">
//               {deleteConfirm ? [deleteConfirm.firstName, deleteConfirm.lastName].filter(Boolean).join(' ') : ''}
//             </span>
//             ? This action cannot be undone.
//           </p>
//           <DialogFooter className="gap-2 sm:gap-0 mt-2">
//             <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
//             <Button variant="destructive" onClick={handleDelete}>Delete</Button>
//           </DialogFooter>
//         </DialogContent>
//       </Dialog>
//     </div>
//   );
// }

import { useEffect, useState, useMemo } from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
// import {
//   BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
//   PieChart, Pie, Cell, Legend
// } from 'recharts';
import {
  UserPlus, Search, Trash2, Pencil, Gavel, UserCheck,
  // UserMinus,
  MoreHorizontal, Download, Filter, ShieldAlert,
  // UserRound,
  ShieldCheck
} from 'lucide-react';
import { toast } from 'react-toastify';
import { useTheme } from '@/context/ThemeContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from '@/components/ui/label';
import {
  fetchUsersByRole,
  createUser,
  deleteUser,
  updateUser,
} from '@/redux/actions/settingsUserActions';
import { selectUsersByRole, selectUsersLoadingByRole } from '@/redux/selectors/settingsUsersSelectors';
import type { AppDispatch, RootState } from '@/redux/store';
import type { User } from '@/types/userTypes';
import { axiosPost } from '@/redux/axios';
import { useNavigate } from 'react-router';
import { formatDate as formatDateUtil } from "@/lib/utils";
import { formatUSPhoneNumber, handleUSPhoneInputChange } from '@/utils/formatPhoneNumber';

const ROLE_ID = 'UNDERWRITER';
const LABEL = 'Underwriter';
const LABEL_PLURAL = 'Underwriters';

function formatDate(dateStr: string | undefined): string {
  return formatDateUtil(dateStr ?? "", "—");
}

// Performance metrics for the graph
// const performanceData = [
//   { name: 'Week 1', approvals: 45, rejections: 12 },
//   { name: 'Week 2', approvals: 52, rejections: 8 },
//   { name: 'Week 3', approvals: 48, rejections: 15 },
//   { name: 'Week 4', approvals: 61, rejections: 10 },
// ];

export default function FinalUnderwritersDashboard() {
  const dispatch = useDispatch<AppDispatch>();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const navigate = useNavigate();
  const users: User[] = useSelector((state: RootState) => selectUsersByRole(state, ROLE_ID), shallowEqual);
  const loading = useSelector((state: RootState) => selectUsersLoadingByRole(state, ROLE_ID));

  const [search, setSearch] = useState('');

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<User | null>(null);

  // Add / Edit form state
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  useEffect(() => {
    dispatch(fetchUsersByRole(ROLE_ID));
  }, [dispatch]);

  const stats = useMemo(() => ({
    total: users.length,
    active: users.filter(u => u.isActive).length,
    avgTurnaround: "4.2 hrs",
    decisionRate: "92%"
  }), [users]);

  const filtered = users.filter((u) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const name = `${u.firstName} ${u.lastName}`.toLowerCase();
    return (
      name.includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.phone?.toLowerCase().includes(q)
    );
  });

  const handleLoginAsFUW = async (userId: string) => {
    try {
      const token = localStorage.getItem("token");

      const res = await axiosPost(
        "/users/impersonate",
        { userId },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const { token: newToken, user } = res.data;

      localStorage.setItem("token", newToken);
      localStorage.setItem("user", JSON.stringify(user));
      localStorage.setItem("role", user.role);

      toast.success("Logged in as Underwriter");

      navigate("/");

    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Impersonation failed");
    }
  };

  // --- Add ---
  const openAddModal = () => {
    setFormName('');
    setFormEmail('');
    setFormPhone('');
    setFormPassword('');
    setAddModalOpen(true);
  };

  const handleAdd = async () => {
    if (!formName.trim() || !formEmail.trim() || !formPassword.trim()) {
      toast.error('Name, Email and Password are required');
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

      toast.success(`${LABEL} created successfully`);
      setAddModalOpen(false);
      dispatch(fetchUsersByRole(ROLE_ID));
    } catch (err: any) {
      toast.error(err?.message ?? `Failed to create ${LABEL.toLowerCase()}`);
    } finally {
      setFormSubmitting(false);
    }
  };

  // --- Edit ---
  const openEditModal = (user: User) => {
    setEditUser(user);
    setFormName([user.firstName, user.lastName].filter(Boolean).join(' '));
    setFormEmail(user.email || '');
    setFormPhone(user.phone ?? '');
    setFormPassword('');
  };

  const handleEdit = async () => {
    if (!editUser) return;
    setFormSubmitting(true);
    try {
      const nameParts = formName.trim().split(/\s+/);
      await dispatch(
        updateUser({
          id: editUser._id,
          firstName: nameParts[0] ?? '',
          lastName: nameParts.slice(1).join(' ') || '',
          email: formEmail.trim().toLowerCase(),
          phone: formPhone.trim() || undefined,
        }),
      ).unwrap();

      toast.success(`${LABEL} updated successfully`);
      setEditUser(null);
      dispatch(fetchUsersByRole(ROLE_ID));
    } catch (err: any) {
      toast.error(err?.message ?? `Failed to update ${LABEL.toLowerCase()}`);
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

      toast.success(`${LABEL} deleted`);
      setDeleteConfirm(null);
      dispatch(fetchUsersByRole(ROLE_ID));
    } catch (err: any) {
      toast.error(err?.message ?? `Failed to delete ${LABEL.toLowerCase()}`);
    } finally {
      setFormSubmitting(false);
    }
  };


  const cardBg = isDark ? 'bg-[#111827] border border-[#1f2937]' : 'bg-white border border-[#E5E7EB]';
  const textMuted = isDark ? 'text-slate-400' : 'text-slate-500';

  return (
    <div
      className={`min-h-screen flex flex-col ${isDark ? 'bg-[#141517] text-white' : 'bg-background text-[#111827]'}`}
    >

      {/* Header */}
      <header className="px-4 md:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">All {LABEL_PLURAL}</h1>
          <p className={`text-xs ${textMuted}`}>
            Managing senior underwriting staff and final decision authority levels.
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

      {/* 2. Analytics Section */}
      {/* <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
       
        <div className={`lg:col-span-2 p-6 rounded-2xl border shadow-sm ${surfaceBase}`}>
          <h3 className="font-bold mb-6 flex items-center gap-2">
            <Gavel className="text-blue-500" size={18} /> Decision Output Trend
          </h3>
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={performanceData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#334155' : '#e2e8f0'} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94a3b8'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#94a3b8'}} />
                <Tooltip cursor={{fill: 'transparent'}} />
                <Legend iconType="circle" />
                <Bar dataKey="approvals" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={30} />
                <Bar dataKey="rejections" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

     
        <div className={`p-6 rounded-2xl border shadow-sm ${surfaceBase}`}>
          <h3 className="font-bold mb-4">Staff Integrity</h3>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={[{n:'A', v:stats.active}, {n:'I', v:stats.total - stats.active}]} innerRadius={60} outerRadius={80} dataKey="v">
                  <Cell fill="#3b82f6" />
                  <Cell fill={isDark ? '#334155' : '#e2e8f0'} />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="text-center mt-2">
            <span className="text-2xl font-black">{stats.decisionRate}</span>
            <p className="text-[10px] text-slate-500 uppercase font-bold">Decision Accuracy</p>
          </div>
        </div>
      </div> */}

      {/* Statistics Cards */}
      <div className="px-6 py-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Total Decision Makers" value={stats.total} icon={<Gavel className="text-blue-500" />} />
        <StatCard title="In Office" value={stats.active} icon={<UserCheck className="text-green-500" />} />
        <StatCard title="Avg. Turnaround" value={stats.avgTurnaround} icon={<ShieldAlert className="text-orange-500" />} />
        <StatCard title="Decision Rate" value={stats.decisionRate} icon={<UserPlus className="text-purple-500" />} />
      </div>

      {/* Filter and Search Bar */}
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
            className={`pl-9 h-9 text-xs ${isDark ? 'bg-[#1a1b1e] border-gray-700' : 'bg-white border-gray-300'
              }`}
          />
        </div>
      </div>

      {/* Management Table */}
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
                    ? 'bg-[#1e293b] hover:bg-[#1e293b]'
                    : 'bg-[image:var(--brand-gradient)] hover:bg-[image:var(--brand-gradient)]'} border-b-0`}
                >
                  <TableHead className="text-white font-medium text-xs w-[40px] px-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 accent-[var(--brand)] cursor-pointer"
                    />
                  </TableHead>
                  <TableHead className="text-white font-medium text-xs">NAME</TableHead>
                  <TableHead className="text-white font-medium text-xs">EMAIL</TableHead>
                  <TableHead className="text-white font-medium text-xs">PHONE</TableHead>
                  <TableHead className="text-white font-medium text-xs">STATUS</TableHead>
                  <TableHead className="text-white font-medium text-xs">CREATED</TableHead>
                  <TableHead className="text-white font-medium text-xs text-left">
                    ACTIONS
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filtered.map((u) => {
                  const id = u._id ?? (u as any).id;
                  const name =
                    [u.firstName, u.lastName].filter(Boolean).join(' ') || '—';

                  return (
                    <TableRow
                      key={id}
                      className={`${isDark
                        ? 'border-b border-[#1f2937] hover:bg-[#1a2332]'
                        : 'border-b border-[#E5E7EB] hover:bg-[#f9fafb]'}`}
                    >
                      <TableCell className="w-[40px] px-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 accent-[var(--brand)] cursor-pointer"
                        />
                      </TableCell>
                      <TableCell className="font-medium text-sm">{name}</TableCell>
                      <TableCell className="text-sm opacity-80">{u.email}</TableCell>
                      <TableCell className="text-sm opacity-80">{u.phone ? formatUSPhoneNumber(u.phone) : '—'}</TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${u.isActive
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            }`}
                        >
                          {u.isActive ? 'Active' : 'Inactive'}
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
                              onClick={() => handleLoginAsFUW(u._id)}
                              className="gap-2"
                            >
                              <ShieldCheck size={14} /> Login as FUW
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
            ? 'bg-[#0f172a] border-[#1f2937]'
            : 'bg-[#F9FAFB] border-[#E5E7EB]'
            }`}
        >
          <span className="opacity-60">
            {filtered.length}{' '}
            {filtered.length === 1
              ? LABEL.toLowerCase()
              : LABEL_PLURAL.toLowerCase()}
          </span>
        </div>
      </section>

      {/* Add Underwriter Modal */}
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
              {formSubmitting ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Underwriter Modal */}
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
              {formSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog
        open={!!deleteConfirm}
        onOpenChange={(o: boolean) => !o && setDeleteConfirm(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {LABEL}</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Are you sure you want to delete{' '}
            <span className="font-semibold">
              {deleteConfirm
                ? [deleteConfirm.firstName, deleteConfirm.lastName]
                  .filter(Boolean)
                  .join(' ')
                : ''}
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
              {formSubmitting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Reusable KPI Card
function StatCard({ title, value, icon }: { title: string, value: string | number, icon: React.ReactNode }) {
  const isDark = useTheme().resolvedTheme === 'dark';
  return (
    <div className={`p-5 rounded-xl border shadow-sm hover:scale-[1.02] transition-transform ${isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#e2e8f0]'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{title}</span>
        <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">{icon}</div>
      </div>
      <span className="text-2xl font-black">{value}</span>
    </div>

  );
}