import { scrollToBottomButtonAnimation } from './animations';

describe('shared animations', () => {
  it('exposes the scrollToBottomButtonAnimation trigger under the name the template uses', () => {
    expect(scrollToBottomButtonAnimation.name).toBe('scrollToBottomButtonAnimation');
  });
});
