import React, { useState } from 'react';
import { Eye, Trash2, MoreHorizontal, X, Check, Search, Filter, Download } from 'lucide-react';

// --- Types ---
type Application = {
  id: number;
  dealName: string;
  amount: string;
  state: string;
  createdAt: string;
  status: 'Approved' | 'Pending' | 'Contract Sent';
};

type CasesDashboardProps = {
  applicationId?: string;
};

const MOCK_DATA: Application[] = [
  { id: 21, dealName: "Land of Fire ABC", amount: "$20,000", state: "Florida", createdAt: "Sep 29, 2025", status: "Contract Sent" },
  { id: 22, dealName: "Oceanic Ventures", amount: "$45,000", state: "California", createdAt: "Oct 02, 2025", status: "Approved" },
  { id: 23, dealName: "Desert Sand LLC", amount: "$12,500", state: "Arizona", createdAt: "Oct 05, 2025", status: "Pending" },
  { id: 24, dealName: "Mountain Peak", amount: "$60,000", state: "Colorado", createdAt: "Oct 10, 2025", status: "Contract Sent" },
];

export const CasesDashboard: React.FC<CasesDashboardProps> = ({ applicationId }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [openActionMenu, setOpenActionMenu] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const handleViewDetails = () => {
    setOpenActionMenu(null);
    setIsModalOpen(true);
  };



  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans text-slate-700 pb-12">
      {/* Header Section */}
      <div className="bg-white border-b border-slate-200 mb-8 px-8 py-6">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-medium text-slate-900 tracking-tight">
              Document Request & Contract
            </h1>
            <p className="text-sm text-slate-500 font-medium">Manage document requests and drafting pipelines</p>
          </div>
          <div className="flex gap-3">
             <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-all shadow-sm">
                <Download size={16} /> Export
             </button>
           
          </div>
        </div>
      </div>

      <div className="w-full mx-auto px-8">
        {/* Table Controls */}
        <div className="flex justify-between items-center mb-4 gap-4">
            <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                    className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    placeholder="Search by deal name or ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50">
                <Filter size={16} /> Filters
            </button>
        </div>

        {/* Applications Table Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 text-[11px] uppercase font-bold text-slate-500 border-b border-slate-200">
                <th className="px-6 py-4 w-12"><input type="checkbox" className="rounded-md border-slate-300 text-blue-600 focus:ring-blue-500" /></th>
                <th className="px-4 py-4">ID</th>
                <th className="px-4 py-4">Deal Name</th>
                <th className="px-4 py-4">Funding</th>
                <th className="px-4 py-4">State</th>
                <th className="px-4 py-4">Status</th>
                <th className="px-4 py-4 text-left">Action</th>
              </tr>
            </thead>
            <tbody className="text-[13px] divide-y divide-slate-100">
              {MOCK_DATA.map((app) => (
                <tr key={app.id} className="hover:bg-slate-50/80 transition-colors group">
                  <td className="px-6 py-4">
                    <input type="checkbox" className="rounded-md border-slate-300 text-blue-600 focus:ring-blue-500" />
                  </td>
                  <td className="px-4 py-4 font-bold text-slate-400">#{app.id}</td>
                  <td className="px-4 py-4 font-semibold text-slate-900">{app.dealName}</td>
                  <td className="px-4 py-4 text-slate-600 font-medium">{app.amount}</td>
                  <td className="px-4 py-4 text-slate-500">{app.state}</td>
                  <td className="px-4 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                        app.status === 'Contract Sent' ? 'bg-blue-50 text-blue-600' : 
                        app.status === 'Approved' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                    }`}>
                        {app.status}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-left relative">
                    <button 
                      onClick={() => setOpenActionMenu(openActionMenu === app.id ? null : app.id)}
                      className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
                    >
                      <MoreHorizontal size={18} />
                    </button>

                    {openActionMenu === app.id && (
                      <div className="absolute right-4 top-12 w-40 bg-white shadow-2xl border border-slate-100 rounded-xl z-50 py-1.5 animate-in fade-in slide-in-from-top-2">
                        <button onClick={handleViewDetails} className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-slate-50 text-slate-700 transition-colors">
                          <Eye size={16} className="text-slate-400" /> <span className="text-[12px] font-semibold">View Case</span>
                        </button>
                        <button className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-red-50 text-red-600 transition-colors border-t border-slate-50 mt-1">
                          <Trash2 size={16} className="text-red-400" /> <span className="text-[12px] font-semibold">Archive</span>
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="bg-slate-50/50 px-6 py-4 border-t border-slate-200 flex justify-between items-center">
                <span className="text-[12px] text-slate-500 font-medium">Showing 4 of 128 applications</span>
                <div className="flex gap-2">
                    <button className="px-3 py-1 bg-white border border-slate-200 rounded text-[12px] font-bold hover:bg-slate-50">Prev</button>
                    <button className="px-3 py-1 bg-white border border-slate-200 rounded text-[12px] font-bold hover:bg-slate-50">Next</button>
                </div>
          </div>
        </div>
      </div>

      {/* --- MODAL (Enhanced View Details) --- */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-[1000] p-4 font-sans">
          <div className="bg-white rounded-xl w-full max-w-4xl max-h-[95vh] overflow-y-auto shadow-2xl">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center sticky top-0 bg-white z-10">
              <h2 className="text-[16px] font-bold text-slate-700">
                Create Contract - LAND OF FIRE ABC EXAMPLE
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xl"
              >
                <X size={20} strokeWidth={3} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* 1. Progress Stepper */}
              <div className="flex items-center gap-6 px-2 overflow-x-auto pb-2">
                {["Documents", "AI Extract", "Workspace", "Verify", "Sent"].map(
                  (step, idx) => (
                    <div
                      key={step}
                      className="flex items-center gap-2 whitespace-nowrap"
                    >
                      <div className="bg-[#1a73e8] rounded-full p-0.5">
                        <Check
                          size={14}
                          className="text-white"
                          strokeWidth={4}
                        />
                      </div>
                      <span className="text-[12px] font-bold text-slate-700">
                        {step}
                      </span>
                      {idx < 4 && (
                        <span className="text-blue-400 text-xs ml-2 tracking-widest">
                          · · · ᐳ
                        </span>
                      )}
                    </div>
                  )
                )}
              </div>

              {/* 2. Deal Info Summary Card */}
              <div className="flex justify-between items-center p-4 border border-slate-200 rounded-lg shadow-sm">
                <div className="flex items-center gap-6">
                  <span className="text-[11px] font-bold text-slate-800 uppercase">
                    Deal Info Summary
                  </span>
                  <span className="text-2xl font-bold text-[#2b78b5]">
                    $20,000.00
                  </span>
                </div>
             
              </div>

              {/* 3. Status Text */}
              <div className="space-y-1">
                <h4 className="text-[13px] font-bold text-slate-900">
                  Contract Already Sent
                </h4>
                <p className="text-[12px] text-slate-600">
                  This contract has already been sent for signature.
                </p>
              </div>

              {/* 4. E-Sign Status Table */}
              <div className="border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                <div className="bg-[#f8fafd] px-4 py-2 border-b border-slate-200">
                  <span className="text-[11px] font-bold text-slate-600">
                    E-Sign Status
                  </span>
                </div>
                <div className="p-5 grid grid-cols-2 gap-x-20 gap-y-3 bg-white text-[12px]">
                  <StatusRow
                    label="Send to Owner"
                    value="Mar 2, 2026, 11:04 AM"
                  />
                  <StatusRow
                    label="Signing Started"
                    value="Mar 2, 2026, 1:23 PM"
                  />
                  <StatusRow
                    label="Link Opened"
                    value="Mar 2, 2026, 1:04 PM"
                  />
                  <StatusRow
                    label="Signed by Owner"
                    value="Not Yet"
                    valueClass="text-slate-900 font-bold"
                  />
                </div>
              </div>

              {/* 5. Action Buttons Grid */}
              <div className="grid grid-cols-5 gap-3">
                <ActionBtn label="View Document" />
                <ActionBtn label="Copy Link" />
                <ActionBtn label="Refresh Status" />
                <ActionBtn label="Resend" />
                <button className="bg-[#fff1f1] text-[#f87171] border border-[#fee2e2] py-2.5 rounded text-[11px] font-bold hover:bg-red-100 transition-colors">
                  Cancel Contract
                </button>
              </div>

              {/* 6. Cancelled Alert */}
              <div className="border border-red-200 bg-[#fff8f8] p-3 rounded-md flex justify-between items-center">
                <div>
                  <p className="text-[11px] font-bold text-[#b91c1c] uppercase">
                    Contract Cancelled
                  </p>
                  <p className="text-[11px] text-slate-700">
                    Does the client have any pending lawsuits?
                  </p>
                </div>
                <button className="bg-[#b4bbc9] text-white px-4 py-2 rounded text-[11px] font-bold cursor-not-allowed">
                  Revise &amp; Resend
                </button>
              </div>

              {/* 7. Profile & Banking (Detailed Cards) */}
              <DetailCard title="Business Profile">
                <div className="grid grid-cols-2 gap-x-16 gap-y-4">
                  <InfoCol label="Number" value="+1 123-456-7890" />
                  <InfoCol label="Monthly Revenue" value="$25,250.00" />
                  <InfoCol label="Email" value="abc@example.com" />
                  <InfoCol label="EIN Number" value="Type67-1234EIN" />
                  <InfoCol label="Incorporation date" value="09-22-2025" />
                  <InfoCol label="Address 1" value="101 Eco Way" />
                  <InfoCol
                    label="Type of business entity"
                    value="Partnership"
                  />
                  <InfoCol label="City" value="Miami" />
                  <InfoCol label="Website" value="www.example.com" />
                  <InfoCol label="State" value="FL" />
                  <InfoCol label="Incorporation State" value="Florida" />
                  <InfoCol label="Zip Code" value="10002" />
                </div>
              </DetailCard>

              <DetailCard title="Banking Details">
                <div className="grid grid-cols-2 gap-x-16 gap-y-4">
                  <InfoCol label="Bank Name" value="ABC Bank" />
                  <InfoCol
                    label="Account Holder"
                    value="Land of fire example"
                  />
                  <InfoCol label="Account Number" value="123456789" />
                  <InfoCol label="Routing Number" value="123456789" />
                </div>
              </DetailCard>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

// --- Sub-components (Polished) ---

const StatusRow = ({ label, value, valueClass }: any) => (
  <div className="flex justify-between items-center group">
    <span className="text-[11px] font-bold text-slate-400 group-hover:text-slate-500 transition-colors">{label}</span>
    <span className={`text-[11px] text-slate-700 font-semibold ${valueClass || ""}`}>
      {value}
    </span>
  </div>
);

const DetailCard = ({ title, children }: any) => (
  <div className="border border-slate-100 rounded-2xl shadow-sm bg-white overflow-hidden">
    <div className="px-6 py-4 border-b border-slate-100 bg-white">
      <span className="text-[12px] font-black text-slate-700 uppercase tracking-widest">{title}</span>
    </div>
    <div className="p-6">{children}</div>
  </div>
);

const InfoCol = ({ label, value }: any) => (
  <div className="space-y-1 group">
    <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider group-hover:text-blue-500 transition-colors">{label}</p>
    <p className="text-sm font-medium text-slate-500">{value}</p>
  </div>
);

const ActionBtn = ({ label }: any) => (
  <button className="w-full bg-white text-slate-700 border border-slate-200 py-3 rounded-xl text-[11px] font-extrabold hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm">
    {label}
  </button>
);