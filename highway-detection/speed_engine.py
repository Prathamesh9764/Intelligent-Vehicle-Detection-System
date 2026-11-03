import ctypes
import os
import numpy as np

_lib = None

def _get_lib():
    global _lib
    if _lib is not None:
        return _lib
    so_path = os.path.join(os.path.dirname(__file__), "cpp", "libspeed_engine.so")
    _lib = ctypes.cdll.LoadLibrary(so_path)

    _lib.box_overlap_polygon.argtypes = [
        ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int,
        ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int), ctypes.c_int,
    ]
    _lib.box_overlap_polygon.restype = ctypes.c_double

    _lib.check_line_crossing.argtypes = [
        ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int,
        ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int,
    ]
    _lib.check_line_crossing.restype = ctypes.c_bool

    _lib.point_in_polygon.argtypes = [
        ctypes.c_int, ctypes.c_int,
        ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int), ctypes.c_int,
    ]
    _lib.point_in_polygon.restype = ctypes.c_bool

    _lib.distance.argtypes = [
        ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int,
    ]
    _lib.distance.restype = ctypes.c_double

    _lib.polygon_area.argtypes = [
        ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int), ctypes.c_int,
    ]
    _lib.polygon_area.restype = ctypes.c_double

    return _lib


def _prepare_poly(poly_pts):
    if isinstance(poly_pts, np.ndarray):
        poly_pts = poly_pts.tolist()
    poly_x = (ctypes.c_int * len(poly_pts))()
    poly_y = (ctypes.c_int * len(poly_pts))()
    for i, (x, y) in enumerate(poly_pts):
        poly_x[i] = int(x)
        poly_y[i] = int(y)
    return poly_x, poly_y


def box_overlap_polygon(x1, y1, x2, y2, poly_pts):
    lib = _get_lib()
    poly_x, poly_y = _prepare_poly(poly_pts)
    return lib.box_overlap_polygon(
        x1, y1, x2, y2, poly_x, poly_y, len(poly_pts)
    )


def check_line_crossing(ax, ay, bx, by, cx, cy, dx, dy):
    lib = _get_lib()
    return lib.check_line_crossing(ax, ay, bx, by, cx, cy, dx, dy)


def point_in_polygon(px, py, poly_pts):
    lib = _get_lib()
    poly_x, poly_y = _prepare_poly(poly_pts)
    return lib.point_in_polygon(px, py, poly_x, poly_y, len(poly_pts))


def distance(x1, y1, x2, y2):
    lib = _get_lib()
    return lib.distance(x1, y1, x2, y2)


def polygon_area(poly_pts):
    lib = _get_lib()
    poly_x, poly_y = _prepare_poly(poly_pts)
    return lib.polygon_area(poly_x, poly_y, len(poly_pts))
