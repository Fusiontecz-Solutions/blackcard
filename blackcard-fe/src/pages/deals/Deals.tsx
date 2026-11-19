import { useNavigate } from 'react-router';
import { useTheme } from '@/context/ThemeContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronDown, Plus } from 'lucide-react';

const mockDeals = [
  {
    id: 12,
    date: '01.12.2026',
    dealName: 'ABC Test',
    status: 'Current',
    funding: '$250,000',
    payback: '$310,000',
    bankFee: '$4,500',
    fee: '$4,500',
    netFunding: '$245,500',
    alreadyNetted: '$25,000',
    daily: '$845.00',
    weekly: '$4,845.00',
    fundingAccount: '$54,000',
    termF: '$54,000',
    iso: '$54,000',
    com: '$54,000',
    comStatus: '$54,000',
    balance: '$54,000',
    percentPaid: '$54,000',
    abovePrinciple: '$54,000',
    rePaid: '$54,000',
  },
];

const Deals = () => {
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Page header */}
      <header
        className={`px-6 py-3 border-b flex items-center justify-between ${isDark ? 'border-[#1f2937] text-white' : 'border-[#E5E7EB] text-[#111827]'}`}
      >
        <h1 className="text-lg font-semibold">Deal</h1>
        <Button
          onClick={() => navigate('/deals/create')}
          className="bg-[#1a73e8] hover:bg-[#1557b0] text-white text-xs font-medium px-4 h-9 rounded-lg"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Add Deal
        </Button>
      </header>

      {/* Filter bar */}
      <section
        className={`mx-6 mt-4 rounded-xl px-4 py-3 flex flex-wrap gap-3 items-center ${isDark ? 'bg-[#111827] border border-[#1f2937]' : 'bg-white border border-[#E5E7EB]'
          }`}
      >
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <span>Filter:</span>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="h-9 min-w-[130px] justify-between text-xs font-normal border-[#D1D5DB]"
            >
              All RFCs
              <ChevronDown className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-9 min-w-[160px] justify-between text-xs font-normal border-[#D1D5DB]"
            >
              Filter by Status
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 ml-auto text-xs">
          <div className="flex items-center gap-2">
            <span>Start Date:</span>
            <Input
              type="date"
              className="h-9 w-[140px] text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <span>End Date:</span>
            <Input
              type="date"
              className="h-9 w-[140px] text-xs"
            />
          </div>
        </div>
      </section>

      {/* Funded deals table */}
      <section
        className={`mx-6 mt-4 mb-6 rounded-xl overflow-hidden ${isDark ? 'bg-[#111827] border border-[#1f2937]' : 'bg-white border border-[#E5E7EB]'
          }`}
      >
        <div className="px-4 py-3 text-sm font-semibold border-b border-inherit">
          Funded Deals
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className={`${isDark ? 'bg-[#111827]' : 'bg-[#F9FAFB]'}`}>
              <tr className="text-left">
                <th className="px-4 py-2 font-medium">ID</th>
                <th className="px-4 py-2 font-medium">DATE</th>
                <th className="px-4 py-2 font-medium">DEAL NAME</th>
                <th className="px-4 py-2 font-medium">STATUS</th>
                <th className="px-4 py-2 font-medium">FUNDING</th>
                <th className="px-4 py-2 font-medium">PAYBACK</th>
                <th className="px-4 py-2 font-medium">BANK FEE</th>
                <th className="px-4 py-2 font-medium">FEE IT</th>
                <th className="px-4 py-2 font-medium">NET FUNDING</th>
                <th className="px-4 py-2 font-medium">ALREADY NETTED</th>
                <th className="px-4 py-2 font-medium">DAILY</th>
                <th className="px-4 py-2 font-medium">WEEKLY</th>
                <th className="px-4 py-2 font-medium">FUNDING ACCOUNT</th>
                <th className="px-4 py-2 font-medium">TERM/F</th>
                <th className="px-4 py-2 font-medium">ISO</th>
                <th className="px-4 py-2 font-medium">COM</th>
                <th className="px-4 py-2 font-medium">STATUS</th>
                <th className="px-4 py-2 font-medium">BALANCE</th>
                <th className="px-4 py-2 font-medium">% PAID</th>
                <th className="px-4 py-2 font-medium">ABOVE PRINCIPLE</th>
                <th className="px-4 py-2 font-medium">RE PAID</th>
              </tr>
            </thead>
            <tbody>
              {mockDeals.map((deal) => (
                <tr
                  key={deal.id}
                  className={`${isDark ? 'border-t border-[#1f2937]' : 'border-t border-[#E5E7EB]'}`}
                >
                  <td className="px-4 py-2">{deal.id}</td>
                  <td className="px-4 py-2">{deal.date}</td>
                  <td className="px-4 py-2">{deal.dealName}</td>
                  <td className="px-4 py-2">{deal.status}</td>
                  <td className="px-4 py-2">{deal.funding}</td>
                  <td className="px-4 py-2">{deal.payback}</td>
                  <td className="px-4 py-2">{deal.bankFee}</td>
                  <td className="px-4 py-2">{deal.fee}</td>
                  <td className="px-4 py-2">{deal.netFunding}</td>
                  <td className="px-4 py-2">{deal.alreadyNetted}</td>
                  <td className="px-4 py-2">{deal.daily}</td>
                  <td className="px-4 py-2">{deal.weekly}</td>
                  <td className="px-4 py-2">{deal.fundingAccount}</td>
                  <td className="px-4 py-2">{deal.termF}</td>
                  <td className="px-4 py-2">{deal.iso}</td>
                  <td className="px-4 py-2">{deal.com}</td>
                  <td className="px-4 py-2">{deal.comStatus}</td>
                  <td className="px-4 py-2">{deal.balance}</td>
                  <td className="px-4 py-2">{deal.percentPaid}</td>
                  <td className="px-4 py-2">{deal.abovePrinciple}</td>
                  <td className="px-4 py-2">{deal.rePaid}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary footer row */}
        <div
          className={`flex justify-between items-center px-4 py-3 text-[11px] ${isDark ? 'bg-[#0f172a]' : 'bg-[#F9FAFB]'
            }`}
        >
          <div className="flex flex-col">
            <span>0</span>
            <span className="opacity-60">Records</span>
          </div>
          <div className="flex flex-wrap justify-end gap-x-8 gap-y-1 text-right min-w-0">
            <div>
              <div className="font-semibold">Total Funding $0</div>
            </div>
            <div>
              <div className="font-semibold">Total Payback</div>
            </div>
            <div>
              <div className="font-semibold">Total Bank Fee</div>
            </div>
            <div>
              <div className="font-semibold">Total Net Funding</div>
            </div>
            <div>
              <div className="font-semibold">Total Already Netted</div>
            </div>
            <div>
              <div className="font-semibold">Total Daily</div>
            </div>
            <div>
              <div className="font-semibold">Total Weekly</div>
            </div>
            <div>
              <div className="font-semibold">Total Com</div>
            </div>
            <div>
              <div className="font-semibold">Total Balance</div>
            </div>
            <div>
              <div className="font-semibold">Total Above Principal</div>
            </div>
            <div>
              <div className="font-semibold">Total RePaid</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Deals;

