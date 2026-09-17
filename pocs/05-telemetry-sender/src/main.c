#include <stdio.h>

#include "delay.h"
#include "setup.h"
#include "telemetry.h"

#define SAMPLE_RATE_HZ  100
#define DURATION_S      10
#define TOTAL_FRAMES    (SAMPLE_RATE_HZ * DURATION_S)
#define FRAME_PERIOD_MS (1000 / SAMPLE_RATE_HZ)

void sys_tick_handler(void) {
  clock_tick();
}

int main(void) {
  setup();
  telemetry_init();

  printf("\r\n=== OPR Telemetry Test Sender (STM32F401CC) ===\r\n");
  printf("Sample rate: %d Hz | Duration: %d s | Frames: %d\r\n",
         SAMPLE_RATE_HZ, DURATION_S, TOTAL_FRAMES);
  printf("Format: T:<ms>,adc1:v,...,state:v\r\n");
  printf("--------------------------------------------------\r\n");

  uint32_t start = get_clock_ticks();

  for (uint32_t frame = 0; frame < TOTAL_FRAMES; frame++) {
    /* Wait until next frame slot */
    uint32_t target = frame * FRAME_PERIOD_MS;
    while ((get_clock_ticks() - start) < target) {
    };

    uint32_t elapsed = get_clock_ticks() - start;

    /* Heartbeat LED toggle every 500 frames */
    if ((frame % 500) == 0)
      gpio_toggle(GPIOB, GPIO12);

    /* Generate and print one telemetry frame */
    telemetry_print_frame(elapsed);

    /* Wait remaining time to fill the frame slot */
    uint32_t frame_end = (frame + 1) * FRAME_PERIOD_MS;
    while ((get_clock_ticks() - start) < frame_end) {
    };
  }

  printf("\r\n=== Done: %lu frames sent ===\r\n", (unsigned long)TOTAL_FRAMES);

  /* Fast LED blink to indicate completion */
  while (1) {
    gpio_toggle(GPIOB, GPIO12);
    delay(200);
  }

  return 0;
}
