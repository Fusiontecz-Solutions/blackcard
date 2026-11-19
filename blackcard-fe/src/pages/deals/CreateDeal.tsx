import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const CreateDeal = () => {
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const [formData, setFormData] = useState({
    type: '',
    client: '',
    company: '',
    merchantCode: '',
    paymentFrequency: '',
    advanceAmount: '',
    flexType: '',
    flexReverseAmount: '',
    term: '',
    factorRate: '',
    dailyPayment: '',
    paybackAmount: '',
    iso: '',
    earlyPayoffAmount: '',
    legalDefaultFee: '',
    isoFee: '',
    managementFee: '',
    psfFee: '',
    bankFee: '',
    totalCommissions: '',
    commissionToSyndicator: '',
    commissionToAdmin: '',
    otherFee: '',
    dealStartDate: '',
    uccUploaded: false,
    flexReverseDeal: false,
    commissionPaid: false,
    legalDefaultFeePaid: false,
  });

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleContinue = () => {
    // TODO: submit form data
    console.log('Form data:', formData);
  };

  const cardBg = isDark
    ? 'bg-[#111827] border border-[#1f2937]'
    : 'bg-white border border-[#E5E7EB]';

  const inputClass = isDark
    ? 'bg-[#1f2937] border-[#374151] text-white placeholder:text-gray-500'
    : 'bg-white border-[#D1D5DB] text-[#111827] placeholder:text-gray-400';

  return (
    <div
      className={`min-h-screen flex flex-col ${
        isDark ? 'bg-[#141517] text-white' : 'bg-background text-[#111827]'
      }`}
    >
      {/* Page header */}
      <header
        className={`px-6 py-3 border-b ${
          isDark ? 'border-[#1f2937]' : 'border-[#E5E7EB]'
        }`}
      >
        <h1 className="text-lg font-semibold">Deal</h1>
      </header>

      {/* Back + Title */}
      <div className="px-6 pt-5 pb-2">
        <button
          onClick={() => navigate('/deals')}
          className="flex items-center gap-2 text-sm font-semibold hover:opacity-80"
        >
          <ArrowLeft className="h-4 w-4" />
          Create New Deal
        </button>
      </div>

      {/* Form card */}
      <section className={`mx-6 mt-2 mb-6 rounded-xl p-6 ${cardBg}`}>
        <h2 className="text-sm font-semibold mb-6">Inhouse Deals</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5">
          {/* Row 1 */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Type</Label>
            <Select
              value={formData.type}
              onValueChange={(v: string) => handleInputChange('type', v)}
            >
              <SelectTrigger className={`h-9 text-xs ${inputClass}`}>
                <SelectValue placeholder="Select Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mca">MCA</SelectItem>
                <SelectItem value="loan">Loan</SelectItem>
                <SelectItem value="line_of_credit">Line of Credit</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Client</Label>
            <Select
              value={formData.client}
              onValueChange={(v: string) => handleInputChange('client', v)}
            >
              <SelectTrigger className={`h-9 text-xs ${inputClass}`}>
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="client1">Client 1</SelectItem>
                <SelectItem value="client2">Client 2</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Company</Label>
            <Select
              value={formData.company}
              onValueChange={(v: string) => handleInputChange('company', v)}
            >
              <SelectTrigger className={`h-9 text-xs ${inputClass}`}>
                <SelectValue placeholder="Select Company" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="company1">Company 1</SelectItem>
                <SelectItem value="company2">Company 2</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Merchant Code</Label>
            <Input
              placeholder="Enter Merchant Code"
              value={formData.merchantCode}
              onChange={(e) => handleInputChange('merchantCode', e.target.value)}
              className={`h-9 text-xs ${inputClass}`}
            />
          </div>

          {/* Row 2 */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Payment Frequency</Label>
            <Select
              value={formData.paymentFrequency}
              onValueChange={(v: string) => handleInputChange('paymentFrequency', v)}
            >
              <SelectTrigger className={`h-9 text-xs ${inputClass}`}>
                <SelectValue placeholder="Select Payment Frequency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="bi-weekly">Bi-Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Advance Amount</Label>
            <Input
              placeholder="Enter Advance Amount"
              value={formData.advanceAmount}
              onChange={(e) =>
                handleInputChange('advanceAmount', e.target.value)
              }
              className={`h-9 text-xs ${inputClass}`}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Flex Type</Label>
            <Select
              value={formData.flexType}
              onValueChange={(v: string) => handleInputChange('flexType', v)}
            >
              <SelectTrigger className={`h-9 text-xs ${inputClass}`}>
                <SelectValue placeholder="Select Flex Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">Fixed</SelectItem>
                <SelectItem value="variable">Variable</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Flex/Reverse Amount</Label>
            <Input
              placeholder="Enter Flex/Reverse Amount"
              value={formData.flexReverseAmount}
              onChange={(e) =>
                handleInputChange('flexReverseAmount', e.target.value)
              }
              className={`h-9 text-xs ${inputClass}`}
            />
          </div>

          {/* Row 3 */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Term</Label>
            <Input
              placeholder="Enter Term"
              value={formData.term}
              onChange={(e) => handleInputChange('term', e.target.value)}
              className={`h-9 text-xs ${inputClass}`}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Factor Rate</Label>
            <Input
              placeholder="Enter Factor Rate"
              value={formData.factorRate}
              onChange={(e) => handleInputChange('factorRate', e.target.value)}
              className={`h-9 text-xs ${inputClass}`}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Daily Payment</Label>
            <Input
              placeholder="Enter Daily Payment"
              value={formData.dailyPayment}
              onChange={(e) =>
                handleInputChange('dailyPayment', e.target.value)
              }
              className={`h-9 text-xs ${inputClass}`}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Payback Amount</Label>
            <Input
              placeholder="Enter Payback Amount"
              value={formData.paybackAmount}
              onChange={(e) =>
                handleInputChange('paybackAmount', e.target.value)
              }
              className={`h-9 text-xs ${inputClass}`}
            />
          </div>

          {/* Row 4 */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">ISOs</Label>
            <Select
              value={formData.iso}
              onValueChange={(v: string) => handleInputChange('iso', v)}
            >
              <SelectTrigger className={`h-9 text-xs ${inputClass}`}>
                <SelectValue placeholder="Select ISO" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="iso1">ISO 1</SelectItem>
                <SelectItem value="iso2">ISO 2</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Early Payoff Amount</Label>
            <Input
              placeholder="Enter Early Payoff Amount"
              value={formData.earlyPayoffAmount}
              onChange={(e) =>
                handleInputChange('earlyPayoffAmount', e.target.value)
              }
              className={`h-9 text-xs ${inputClass}`}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Legal/Default Fee (%)</Label>
            <Input
              placeholder="Enter Default Fee %"
              value={formData.legalDefaultFee}
              onChange={(e) =>
                handleInputChange('legalDefaultFee', e.target.value)
              }
              className={`h-9 text-xs ${inputClass}`}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">ISO Fee (%)</Label>
            <Input
              placeholder="Enter ISO Fee %"
              value={formData.isoFee}
              onChange={(e) => handleInputChange('isoFee', e.target.value)}
              className={`h-9 text-xs ${inputClass}`}
            />
          </div>

          {/* Row 5 */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Management Fee (%)</Label>
            <Input
              placeholder="Enter Management Fee %"
              value={formData.managementFee}
              onChange={(e) =>
                handleInputChange('managementFee', e.target.value)
              }
              className={`h-9 text-xs ${inputClass}`}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">PSF Fee (%)</Label>
            <Input
              placeholder="Enter PSF Fee %"
              value={formData.psfFee}
              onChange={(e) => handleInputChange('psfFee', e.target.value)}
              className={`h-9 text-xs ${inputClass}`}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Bank Fee (%)</Label>
            <Input
              placeholder="Enter Bank Fee %"
              value={formData.bankFee}
              onChange={(e) => handleInputChange('bankFee', e.target.value)}
              className={`h-9 text-xs ${inputClass}`}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Total Commissions</Label>
            <Input
              placeholder="Total Commission"
              value={formData.totalCommissions}
              onChange={(e) =>
                handleInputChange('totalCommissions', e.target.value)
              }
              className={`h-9 text-xs ${inputClass}`}
            />
          </div>

          {/* Row 6 */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">
              Commission to Syndicator
            </Label>
            <Input
              placeholder="Commission to REP"
              value={formData.commissionToSyndicator}
              onChange={(e) =>
                handleInputChange('commissionToSyndicator', e.target.value)
              }
              className={`h-9 text-xs ${inputClass}`}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Commission to Admin</Label>
            <Input
              placeholder="Commission to Admin"
              value={formData.commissionToAdmin}
              onChange={(e) =>
                handleInputChange('commissionToAdmin', e.target.value)
              }
              className={`h-9 text-xs ${inputClass}`}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Other Fee (%)</Label>
            <Input
              placeholder="Enter Other Fee %"
              value={formData.otherFee}
              onChange={(e) => handleInputChange('otherFee', e.target.value)}
              className={`h-9 text-xs ${inputClass}`}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Deal Start Date</Label>
            <Input
              type="date"
              placeholder="dd/mm/yyyy"
              value={formData.dealStartDate}
              onChange={(e) =>
                handleInputChange('dealStartDate', e.target.value)
              }
              className={`h-9 text-xs ${inputClass}`}
            />
          </div>
        </div>

        {/* Checkboxes row */}
        <div className="flex flex-wrap gap-x-10 gap-y-3 mt-6">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox
              checked={formData.uccUploaded}
              onCheckedChange={(v: boolean | "indeterminate") =>
                handleInputChange('uccUploaded', v === true)
              }
            />
            UCC Uploaded
          </label>

          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox
              checked={formData.commissionPaid}
              onCheckedChange={(v: boolean | "indeterminate") =>
                handleInputChange('commissionPaid', v === true)
              }
            />
            Commission Paid
          </label>

          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox
              checked={formData.flexReverseDeal}
              onCheckedChange={(v: boolean | "indeterminate") =>
                handleInputChange('flexReverseDeal', v === true)
              }
            />
            Flex/Reverse Deal
          </label>

          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox
              checked={formData.legalDefaultFeePaid}
              onCheckedChange={(v: boolean | "indeterminate") =>
                handleInputChange('legalDefaultFeePaid', v === true)
              }
            />
            Legal/Default Fee paid
          </label>
        </div>

        {/* Continue button */}
        <div className="flex justify-end mt-8">
          <Button
            onClick={handleContinue}
            className="bg-[#1a73e8] hover:bg-[#1557b0] text-white text-sm font-medium px-8 py-2 rounded-lg"
          >
            Continue
          </Button>
        </div>
      </section>
    </div>
  );
};

export default CreateDeal;
