#include "telemetry.h"

#include <math.h>
#include <stdio.h>

/* ---------- Configuration ---------- */
#define SAMPLE_RATE_HZ  100
#define DURATION_S      10
#define TOTAL_FRAMES    (SAMPLE_RATE_HZ * DURATION_S)

#define IR_SENSOR_COUNT 24

/* ---------- PRNG for IR noise ---------- */
static uint32_t rng_state = 12345;

static uint32_t xorshift32(void) {
  rng_state ^= rng_state << 13;
  rng_state ^= rng_state >> 17;
  rng_state ^= rng_state << 5;
  return rng_state;
}

/* ---------- State machine table ---------- */
typedef struct {
  uint8_t  state;
  uint32_t duration_ms;
} state_entry_t;

static const state_entry_t fsm_table[] = {
    {0, 1000}, /* IDLE       — 1 s  */
    {1, 3000}, /* RUNNING    — 3 s  */
    {2, 1000}, /* TURNING    — 1 s  */
    {3, 2000}, /* SEARCHING  — 2 s  */
    {4,  500}, /* LOST       — 0.5s */
    {5, 2500}, /* FINISHED   — 2.5s */
};

#define FSM_LEN (sizeof(fsm_table) / sizeof(fsm_table[0]))

/* Nombres textuales de cada estado, para probar el parseo de strings. */
static const char *const fsm_names[] = {
    "IDLE", "RUNNING", "TURNING", "SEARCHING", "LOST", "FINISHED",
};

#define DEBUG_STATE_COUNT 4

/* ---------- Public API ---------- */

void telemetry_init(void) {
  rng_state = 12345;
}

void telemetry_print_frame(uint32_t elapsed_ms) {
  float t = (float)elapsed_ms * 0.001f;

  /* 1. ADC sensors: 4 sine waves at different frequencies */
  int adc1 = (int)(2047.5f + 2047.5f * sinf(t * 1.0f));
  int adc2 = (int)(2047.5f + 2047.5f * sinf(t * 2.0f + 1.0f));
  int adc3 = (int)(2047.5f + 2047.5f * sinf(t * 0.5f + 2.0f));
  int adc4 = (int)(2047.5f + 2047.5f * cosf(t * 1.5f));

  /* 2. IR sensors: 24-bit bitmask with scanning beam + noise */
  uint32_t ir_mask = 0;
  int beam_center = (int)(12.0f + 11.0f * sinf(t * 1.2f));
  if (beam_center < 0) beam_center = 0;
  if (beam_center > (IR_SENSOR_COUNT - 1)) beam_center = IR_SENSOR_COUNT - 1;
  for (int b = -2; b <= 2; b++) {
    int idx = beam_center + b;
    if (idx >= 0 && idx <= (IR_SENSOR_COUNT - 1))
      ir_mask |= (1u << idx);
  }
  /* Random noise: toggle ~3 random bits */
  for (int n = 0; n < 3; n++) {
    uint32_t r = xorshift32();
    uint32_t bit = r % IR_SENSOR_COUNT;
    ir_mask ^= (1u << bit);
  }

  /* 3. Position: figure-8 (lemniscate) trajectory */
  float phi = t * 1.26f; /* ~0.2 Hz full cycle */
  float den = 1.0f + sinf(phi) * sinf(phi);
  float pos_x = 100.0f * cosf(phi) / den;
  float pos_y = 100.0f * sinf(phi) * cosf(phi) / den;

  /* 4. State machine */
  uint32_t fsm_time = elapsed_ms;
  uint8_t  fsm_state = 0;
  for (uint32_t i = 0; i < FSM_LEN; i++) {
    if (fsm_time < fsm_table[i].duration_ms) {
      fsm_state = fsm_table[i].state;
      break;
    }
    fsm_time -= fsm_table[i].duration_ms;
  }
  if (fsm_state >= FSM_LEN)
    fsm_state = 0;

  /* 5. Debug sub-state (numérico, cambia cada 600 ms) */
  uint8_t debug_state = (uint8_t)((elapsed_ms / 600) % DEBUG_STATE_COUNT);

  /* Print frame: state (número), state_run (texto) y state_debug (número). */
  printf("T:%lu,adc1:%d,adc2:%d,adc3:%d,adc4:%d,"
         "ir_sensors:0x%06lx,"
         "pos_x:%.2f,pos_y:%.2f,"
         "state:%d,state_run:%s,state_debug:%d\r\n",
         (unsigned long)elapsed_ms,
         adc1, adc2, adc3, adc4,
         (unsigned long)ir_mask,
         (double)pos_x, (double)pos_y,
         (int)fsm_state, fsm_names[fsm_state], (int)debug_state);
}
