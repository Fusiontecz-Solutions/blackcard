import React from 'react';
import { formatCurrency } from '@/lib/utils';
import { Calendar, Filter, ArrowUpDown, ChevronDown, CheckCircle2, Circle } from 'lucide-react';

// --- Sub-Components ---

type StatCardProps = {
  label: string;
  value: string;
  isActive?: boolean;
};

const StatCard: React.FC<StatCardProps> = ({ label, value, isActive }) => (
  <div className={`bg-white p-5 rounded-xl border-2 flex-1 shadow-sm transition-all ${isActive ? 'border-blue-500 ring-4 ring-blue-50' : 'border-transparent hover:border-gray-100'}`}>
    <p className="text-gray-500 text-xs font-medium mb-1 uppercase tracking-wider">{label}</p>
    <p className="text-2xl font-bold text-slate-900">{value}</p>
  </div>
);

type TimelineItemProps = {
  title: string;
  date: string;
  detail?: string;
  colorClass: string;
  isLast?: boolean;
};

const TimelineItem: React.FC<TimelineItemProps> = ({ title, date, detail, colorClass, isLast }) => (
  <div className="flex gap-4 min-h-[70px]">
    <div className="flex flex-col items-center">
      <div className={`w-3 h-3 rounded-full mt-1.5 ${colorClass}`} />
      {!isLast && <div className="w-[2px] h-full bg-gray-100 mt-1" />}
    </div>
    <div className="pb-6">
      <p className="text-sm font-bold text-slate-800 leading-tight">{title}</p>
      <p className="text-[11px] text-gray-400 mt-1 font-medium">{date} {detail && `| ${detail}`}</p>
    </div>
  </div>
);

type StatusType = 'Received' | 'Paid' | 'Failed';

type StatusBadgeProps = {
  status: StatusType;
};

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const styles: Record<StatusType, string> = {
    Received: "bg-emerald-50 text-emerald-600 border-emerald-100",
    Paid: "bg-emerald-50 text-emerald-600 border-emerald-100",
    Failed: "bg-rose-50 text-rose-600 border-rose-100",
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${styles[status] || "bg-gray-50 text-gray-500"}`}>
      {status}
    </span>
  );
};

// --- Main Component ---

export const DetailedPayments = () => {
  return (
    <div className="bg-background min-h-screen p-6 font-sans text-slate-900">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header Section */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-2">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-black tracking-tight uppercase">ABC Client</h1>
            <div className="flex gap-4 text-xs font-medium text-gray-400">
              <span>Client ID: <span className="text-slate-600 font-bold">12345</span></span>
              <span>Deal ID: <span className="text-slate-600 font-bold">D67890</span></span>
              <span>Funding Date: <span className="text-slate-600 font-bold">05 Jan 2025</span></span>
            </div>
          </div>
          <div className="flex gap-4 text-[10px] font-bold uppercase tracking-widest text-blue-600 justify-end">
            <button className="underline">NYSF Search</button>
            <button className="underline">Open Corporates</button>
          </div>
        </div>

        {/* Metric Cards Row */}
        <div className="flex gap-4 overflow-x-auto pb-2">
          <StatCard label="Funded Amount" value="$250,000" />
          <StatCard label="Total Expected" value="$300,000" isActive={true} />
          <StatCard label="Received" value="$180,000" />
          <StatCard label="Due Amount" value="$70,000" />
          <StatCard label="Failed Amount" value="$20,000" />
          <StatCard label="Default Amount" value="$30,000" />
        </div>

        {/* Secondary Info Bar */}
        <div className="bg-white px-6 py-4 rounded-xl border border-gray-100 shadow-sm flex justify-between items-center text-xs font-bold text-gray-500">
          <div className="flex gap-8">
            <span>Payment Type: <span className="text-slate-800 ml-1">Daily</span></span>
            <span>Installment Amount: <span className="text-slate-800 ml-1">$1,200</span></span>
            <span>Total Installments: <span className="text-slate-800 ml-1">250</span></span>
          </div>
          <div className="flex gap-8 items-center">
            <div className="flex items-center gap-2">
              <span>Auto-Pay Status:</span>
              <span className="bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full text-[10px] border border-emerald-200 flex items-center gap-1">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" /> Active
              </span>
            </div>
            <span>Next Payment: <span className="text-blue-600 font-black">12 Feb 2026</span></span>
          </div>
        </div>

        {/* Main Dashboard Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          {/* Left Columns - Tables Area */}
          <div className="lg:col-span-3 space-y-6">
            
            {/* Filter Row */}
            <div className="flex items-center justify-between gap-4">
               <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-gray-100 text-gray-400 text-xs font-medium flex-1 shadow-sm">
                  <Calendar size={14} /> <span>Date Range: 01 Jan 2026 - 31 Jan 2026</span>
               </div>
               <div className="flex gap-2">
                 <button className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-gray-100 text-xs font-bold text-slate-700 shadow-sm"><Filter size={14} /> Status: All <ChevronDown size={14} /></button>
                 <button className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-gray-100 text-xs font-bold text-slate-700 shadow-sm"><ArrowUpDown size={14} /> Sort by: Date <ChevronDown size={14} /></button>
               </div>
            </div>

            {/* Recent Transactions Table */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-gray-50 font-black text-xs uppercase tracking-widest text-slate-800">Recent Transactions</div>
              <table className="w-full text-left text-xs">
                <thead className="text-gray-400 font-bold border-b border-gray-50">
                  <tr>
                    <th className="px-6 py-4 uppercase">Date</th>
                    <th className="px-6 py-4 uppercase">Inst #</th>
                    <th className="px-6 py-4 uppercase">Amount</th>
                    <th className="px-6 py-4 uppercase">Frequency</th>
                    <th className="px-6 py-4 uppercase text-left">Status</th>
                    <th className="px-6 py-4 uppercase">Method</th>
                    <th className="px-6 py-4 uppercase text-left">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 font-bold text-slate-700">
                  {(['Recived', 'Recived', 'Failed'] as StatusType[]).map((status, i) => (
                    <tr key={i} className="hover:bg-gray-50/50">
                      <td className="px-6 py-4">01 Feb 2026</td>
                      <td className="px-6 py-4">#180</td>
                      <td className="px-6 py-4">$1,200</td>
                      <td className="px-6 py-4 text-gray-400 font-medium">Daily</td>
                      <td className="px-6 py-4 text-left"><StatusBadge status={status} /></td>
                      <td className="px-6 py-4 text-gray-400 font-medium">Auto Pay</td>
                      <td className="px-6 py-4 text-left text-blue-600 font-black hover:underline cursor-pointer">Details</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Loan Terms Bar */}
            <div className="bg-white px-6 py-4 rounded-xl border border-gray-100 shadow-sm flex justify-between text-xs font-bold">
              <span className="text-gray-400 font-medium">Principal Amount <span className="text-slate-900 ml-1 font-black">$252,000</span></span>
              <span className="text-gray-400 font-medium">Interest Rate <span className="text-slate-900 ml-1 font-black">2.875%</span></span>
              <span className="text-gray-400 font-medium">Term (in Years) <span className="text-slate-900 ml-1 font-black">30</span></span>
              <span className="text-gray-400 font-medium">Start Date: <span className="text-slate-900 ml-1 font-black">08/01/2026</span></span>
            </div>

            {/* Payment Scheduled Table */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-gray-50 flex justify-between items-center">
                <span className="font-black text-xs uppercase tracking-widest text-slate-800">Payment Scheduled</span>
                <button className="text-[10px] font-bold text-blue-600 hover:underline">View All</button>
              </div>
              <table className="w-full text-left text-xs">
                <thead className="text-gray-400 font-bold border-b border-gray-50">
                  <tr>
                    <th className="px-6 py-4 uppercase">Date</th>
                    <th className="px-6 py-4 uppercase">Inst #</th>
                    <th className="px-6 py-4 uppercase">Amount</th>
                    <th className="px-6 py-4 uppercase">Frequency</th>
                    <th className="px-6 py-4 uppercase text-left">Status</th>
                    <th className="px-6 py-4 uppercase text-left">Balance Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 font-bold text-slate-700">
                  {Array(7).fill(0).map((_, i) => (
                    <tr key={i} className="hover:bg-gray-50/50">
                      <td className="px-6 py-4">{i + 1 < 10 ? `0${i + 1}` : i + 1} Feb 2025</td>
                      <td className="px-6 py-4">#180</td>
                      <td className="px-6 py-4">$1,200</td>
                      <td className="px-6 py-4 text-gray-400 font-medium">Daily</td>
                      <td className="px-6 py-4 text-left"><StatusBadge status={i === 6 ? 'Failed' : 'Paid'} /></td>
                      <td className="px-6 py-4 text-left text-gray-400 font-medium">{formatCurrency(250800 - i * 1200)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </div>

          {/* Right Column - Timelines Area */}
          <div className="lg:col-span-1 space-y-6">
            
            {/* Payment Timeline */}
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm h-fit">
              <h2 className="font-black text-xs uppercase tracking-widest text-slate-800 mb-6">Payment Timeline</h2>
              <div className="mt-4">
                <TimelineItem title="Funded" date="05 Jan 2025" colorClass="bg-emerald-500" />
                <TimelineItem title="First Payment Recieved" date="01 Feb 2025" detail="$1,200" colorClass="bg-blue-600" />
                <TimelineItem title="Missed Payment" date="05 Feb 2025" detail="Installment #13" colorClass="bg-rose-500" />
                <TimelineItem title="Default Triggered" date="20 Feb 2025" colorClass="bg-slate-400" />
                <TimelineItem title="Recovery Payment" date="10 Mar 2025" detail="$5,000" colorClass="bg-amber-500" isLast={true} />
              </div>
            </div>

            {/* Schedule Track */}
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm h-fit">
              <h2 className="font-black text-xs uppercase tracking-widest text-slate-800 mb-6">Schedule Track</h2>
              <div className="mt-4 space-y-8">
                <div className="flex gap-4">
                   <CheckCircle2 className="text-emerald-500 shrink-0 mt-0.5" size={18} />
                   <div className="space-y-1">
                      <p className="text-sm font-bold">Funded</p>
                      <p className="text-[10px] text-gray-400 font-medium">05 Jan 2025 <br/> $250,000 Disbursement</p>
                   </div>
                </div>
                <div className="flex gap-4">
                   <CheckCircle2 className="text-blue-600 shrink-0 mt-0.5" size={18} />
                   <div className="space-y-1">
                      <p className="text-sm font-bold">Last Milestone</p>
                      <p className="text-[10px] text-gray-400 font-medium">10 Jan 2026 <br/> 150th Installment Paid</p>
                   </div>
                </div>
                <div className="flex gap-4 opacity-50">
                   <Circle className="text-gray-300 shrink-0 mt-0.5" size={18} />
                   <div className="space-y-1">
                      <p className="text-sm font-bold">Next Milestone</p>
                      <p className="text-[10px] text-gray-400 font-medium">15 Mar 2026 <br/> 200th Installment</p>
                   </div>
                </div>
                <div className="flex gap-4 opacity-30">
                   <Circle className="text-gray-300 shrink-0 mt-0.5" size={18} />
                   <div className="space-y-1">
                      <p className="text-sm font-bold">Completion</p>
                      <p className="text-[10px] text-gray-400 font-medium">10 Aug 2026 <br/> Project Final Payment</p>
                   </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};