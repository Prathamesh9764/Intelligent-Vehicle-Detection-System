#ifndef SPEED_ENGINE_HPP
#define SPEED_ENGINE_HPP

extern "C" {

double box_overlap_polygon(int x1, int y1, int x2, int y2,
                           const int* poly_x, const int* poly_y, int num_points);

bool check_line_crossing(int ax, int ay, int bx, int by,
                         int cx, int cy, int dx, int dy);

bool point_in_polygon(int px, int py,
                      const int* poly_x, const int* poly_y, int num_points);

double distance(int x1, int y1, int x2, int y2);

double polygon_area(const int* poly_x, const int* poly_y, int num_points);

}

#endif
