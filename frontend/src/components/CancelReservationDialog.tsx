import { useState, type FormEvent } from "react";
import { XCircle } from "lucide-react";
import { Button, Dialog, ErrorState, Field, Textarea } from "./ui";

export function CancelReservationDialog({
  open,
  eventName,
  onClose,
  onConfirm,
}: {
  open: boolean;
  eventName: string;
  onClose: () => void;
  onConfirm: (reason?: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await onConfirm(reason.trim() || undefined);
      onClose();
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      title="Cancel reservation"
      description={`Are you sure you want to cancel "${eventName}"? All allocated assets will be released back into available inventory.`}
      onClose={onClose}
    >
      <form className="dialog-form" onSubmit={(event) => void submit(event)}>
        {Boolean(error) && <ErrorState error={error} />}
        <Field
          label="Reason for cancellation"
          hint="Optional — provide context for managers and requesters"
        >
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="e.g. Event cancelled, date changed, or assets no longer needed"
          />
        </Field>
        <div className="dialog-actions">
          <Button type="button" variant="quiet" onClick={onClose}>
            Keep reservation
          </Button>
          <Button type="submit" variant="danger" loading={loading}>
            <XCircle size={17} />
            Confirm cancellation
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
