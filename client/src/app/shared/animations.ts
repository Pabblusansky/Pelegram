import { trigger, transition, style, animate } from '@angular/animations';

export const scrollToBottomButtonAnimation = trigger('scrollToBottomButtonAnimation', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateY(20px) scale(0.8)' }),
    animate('200ms ease-out', style({ opacity: 1, transform: 'translateY(0) scale(1)' })),
  ]),
  transition(':leave', [
    animate('150ms ease-in', style({ opacity: 0, transform: 'translateY(20px) scale(0.8)' })),
  ]),
]);
