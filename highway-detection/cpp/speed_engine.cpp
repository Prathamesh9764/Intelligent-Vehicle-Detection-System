#include "speed_engine.hpp"
#include <cmath>
#include <cstdint>

static int orientation(int ax, int ay, int bx, int by, int cx, int cy) {
    int64_t val = static_cast<int64_t>(bx - ax) * (cy - ay) -
                  static_cast<int64_t>(by - ay) * (cx - ax);
    if (val == 0) return 0;
    return (val > 0) ? 1 : 2;
}

static bool on_segment(int ax, int ay, int bx, int by, int cx, int cy) {
    return (cx <= std::max(ax, bx) && cx >= std::min(ax, bx) &&
            cy <= std::max(ay, by) && cy >= std::min(ay, by));
}

bool point_in_polygon(int px, int py,
                      const int* poly_x, const int* poly_y, int num_points) {
    if (num_points < 3) return false;
    bool inside = false;
    for (int i = 0, j = num_points - 1; i < num_points; j = i++) {
        int xi = poly_x[i], yi = poly_y[i];
        int xj = poly_x[j], yj = poly_y[j];
        if ((yi > py) != (yj > py)) {
            double intersect_x = static_cast<double>(xj - xi) *
                static_cast<double>(py - yi) / static_cast<double>(yj - yi) + xi;
            if (px < intersect_x)
                inside = !inside;
        }
    }
    return inside;
}

double box_overlap_polygon(int x1, int y1, int x2, int y2,
                           const int* poly_x, const int* poly_y, int num_points) {
    double cx = (x1 + x2) / 2.0;
    double cy = (y1 + y2) / 2.0;
    double w = x2 - x1;
    double h = y2 - y1;

    int pts[5][2] = {
        {static_cast<int>(cx), static_cast<int>(cy)},
        {static_cast<int>(x1 + w * 0.25), static_cast<int>(y1 + h * 0.25)},
        {static_cast<int>(x1 + w * 0.75), static_cast<int>(y1 + h * 0.25)},
        {static_cast<int>(x1 + w * 0.25), static_cast<int>(y1 + h * 0.75)},
        {static_cast<int>(x1 + w * 0.75), static_cast<int>(y1 + h * 0.75)},
    };

    int hits = 0;
    for (int i = 0; i < 5; i++) {
        if (point_in_polygon(pts[i][0], pts[i][1], poly_x, poly_y, num_points))
            hits++;
    }
    return static_cast<double>(hits) / 5.0;
}

bool check_line_crossing(int ax, int ay, int bx, int by,
                         int cx, int cy, int dx, int dy) {
    int o1 = orientation(ax, ay, bx, by, cx, cy);
    int o2 = orientation(ax, ay, bx, by, dx, dy);
    int o3 = orientation(cx, cy, dx, dy, ax, ay);
    int o4 = orientation(cx, cy, dx, dy, bx, by);

    if (o1 != o2 && o3 != o4) return true;

    if (o1 == 0 && on_segment(ax, ay, bx, by, cx, cy)) return true;
    if (o2 == 0 && on_segment(ax, ay, bx, by, dx, dy)) return true;
    if (o3 == 0 && on_segment(cx, cy, dx, dy, ax, ay)) return true;
    if (o4 == 0 && on_segment(cx, cy, dx, dy, bx, by)) return true;

    return false;
}

double distance(int x1, int y1, int x2, int y2) {
    int64_t dx = static_cast<int64_t>(x2) - x1;
    int64_t dy = static_cast<int64_t>(y2) - y1;
    return std::sqrt(static_cast<double>(dx * dx + dy * dy));
}

double polygon_area(const int* poly_x, const int* poly_y, int num_points) {
    if (num_points < 3) return 0.0;
    int64_t area = 0;
    for (int i = 0, j = num_points - 1; i < num_points; j = i++) {
        area += static_cast<int64_t>(poly_x[i]) * poly_y[j] -
                static_cast<int64_t>(poly_x[j]) * poly_y[i];
    }
    return std::abs(static_cast<double>(area)) / 2.0;
}
