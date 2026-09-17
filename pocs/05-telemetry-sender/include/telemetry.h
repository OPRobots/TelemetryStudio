#ifndef __TELEMETRY_H
#define __TELEMETRY_H

#include <stdint.h>

#include "config.h"

void telemetry_init(void);
void telemetry_print_frame(uint32_t elapsed_ms);

#endif
