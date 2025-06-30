import { Directive, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';

@Directive({
  selector: '[appObserveContentSize]',
  standalone: true,
})
export class ObserveContentSizeDirective implements AfterViewInit, OnDestroy {
  private resizeObserver: ResizeObserver;

  constructor(
    private elementRef: ElementRef<HTMLElement>,
    private virtualScrollViewport: CdkVirtualScrollViewport
  ) {
    this.resizeObserver = new ResizeObserver(() => {
      this.virtualScrollViewport.checkViewportSize();
    });
  }

  ngAfterViewInit(): void {
    this.resizeObserver.observe(this.elementRef.nativeElement);
  }

  ngOnDestroy(): void {
    this.resizeObserver.disconnect();
  }
}