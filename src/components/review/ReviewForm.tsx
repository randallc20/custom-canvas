'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

interface ReviewFormProps {
  orderId: string;
  onSubmit: (data: { order_id: string; reviewer_id: string; rating: number; comment?: string }) => Promise<void>;
  reviewerId: string;
  onSuccess?: () => void;
}

export function ReviewForm({ orderId, onSubmit, reviewerId, onSuccess }: ReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (rating === 0) {
      toast('Please select a rating.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        order_id: orderId,
        reviewer_id: reviewerId,
        rating,
        comment: comment.trim() || undefined,
      });
      toast('Review submitted! Thank you for your feedback.', 'success');
      onSuccess?.();
    } catch {
      toast('Failed to submit review.', 'error');
      setSubmitting(false);
    }
  };

  const displayRating = hoveredRating || rating;

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-medium text-gray-700">How was your experience?</p>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              onMouseEnter={() => setHoveredRating(star)}
              onMouseLeave={() => setHoveredRating(0)}
              className="transition-transform hover:scale-110"
              aria-label={`${star} star${star > 1 ? 's' : ''}`}
            >
              <svg
                className={`h-8 w-8 ${star <= displayRating ? 'text-yellow-400' : 'text-gray-200'}`}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="review-comment" className="mb-1 block text-sm font-medium text-gray-700">
          Comments (optional)
        </label>
        <textarea
          id="review-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          maxLength={2000}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
            placeholder:text-gray-400
            focus:border-[#E8704A] focus:outline-none focus:ring-2 focus:ring-[#E8704A]/20"
          placeholder="Tell others about your experience with this artist..."
        />
      </div>

      <Button onClick={handleSubmit} loading={submitting} className="w-full">
        Submit Review
      </Button>
    </div>
  );
}
