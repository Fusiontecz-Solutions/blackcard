import pdf from "pdf-parse";
import { Parser } from "json2csv";
import fs from "fs";

interface Transaction {
    date: string;
    description: string;
    amount: number;
}

export class AutomatedBankStatementService {

    // ✅ Now using filePath instead of buffer
    async parsePDF(filePath: string) {
        const buffer = fs.readFileSync(filePath); // ✅ read temp file

        const data = await pdf(buffer);
        console.log("PDF DATA:", data);
        const text = data.text;

        const transactions = this.extractTransactions(text);

        const totalDebit = transactions.reduce((sum, t) => sum + t.amount, 0);
        const totalCredit = 0;
        const totalTransactions = transactions.length;

        const csv = this.convertToCSV(transactions);

        // 🔥 Optional: delete temp file after processing
        fs.unlinkSync(filePath);

        return {
            transactions,
            totalDebit,
            totalCredit,
            totalTransactions,
            csv
        };
    }

    // private extractTransactions(text: string): Transaction[] {
    //     const regex = /(\d{2}\/\d{2}\/\d{4})\s+(.*?)\s+\$?([\d,]+\.\d{2})/g;

    //     const transactions: Transaction[] = [];
    //     let match;

    //     while ((match = regex.exec(text)) !== null) {
    //         const date = match[1];
    //         const description = match[2].trim();
    //         const amount = parseFloat(match[3].replace(/,/g, ""));

    //         // skip headers
    //         if (description.toLowerCase().includes("description")) continue;

    //         transactions.push({ date, description, amount });
    //     }

    //     return transactions;
    // }

    private extractTransactions(text: string): Transaction[] {
        const transactions: Transaction[] = [];
    
        // ✅ normalize text FIRST (VERY IMPORTANT)
        const cleanText = text
            .replace(/\s+/g, " ")
            .replace(/(\d{2}\/\d{2}\/\d{4})/g, "\n$1"); // force new line before date
    
        const regex = /(\d{2}\/\d{2}\/\d{4})([^\$]+)\$([\d,]+\.\d{2})/g;
    
        let match;
    
        while ((match = regex.exec(cleanText)) !== null) {
            const date = match[1];
            const description = match[2].trim();
            const amount = parseFloat(match[3].replace(/,/g, ""));
    
            // ❌ skip garbage rows
            if (
                description.toLowerCase().includes("description") ||
                description.toLowerCase().includes("balance")
            ) continue;
    
            transactions.push({ date, description, amount });
        }
    
        return transactions;
    }


    private convertToCSV(data: Transaction[]) {
        if (!data?.length) return "";
    
        const parser = new Parser({
            fields: ["date", "description", "amount"],
        });
    
        return parser.parse(data);
    }
}

