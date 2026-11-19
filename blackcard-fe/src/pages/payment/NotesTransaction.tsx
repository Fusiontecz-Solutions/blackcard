import MyNotes from "@/components/application/MyNotes";

type NotesTransactionProps = {
  applicationId?: string;
};

export default function NotesTransaction({ applicationId }: NotesTransactionProps) {
  return <MyNotes applicationId={applicationId} />;
}
