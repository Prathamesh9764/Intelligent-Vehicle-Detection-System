"""
Custom training objects needed to deserialize ``models/best.keras``.

The checkpoint was saved with a compile config referencing the loss and
metric factories below. Re-created from the MIT-licensed
https://github.com/ankandrew/fast-plate-ocr project (only needed at load
time for inference; the factories are never actually called).
"""
from keras import losses, metrics, ops

_custom_objects = {}


def cce_loss(vocabulary_size, label_smoothing=0.01):
    def cce(y_true, y_pred):
        y_true = ops.reshape(y_true, newshape=(-1, vocabulary_size))
        y_pred = ops.reshape(y_pred, newshape=(-1, vocabulary_size))
        return ops.mean(
            losses.categorical_crossentropy(
                y_true, y_pred, from_logits=False, label_smoothing=label_smoothing
            )
        )

    return cce


def focal_cce_loss(vocabulary_size, alpha=0.25, gamma=2.0, label_smoothing=0.01):
    def cce(y_true, y_pred):
        y_true = ops.reshape(y_true, newshape=(-1, vocabulary_size))
        y_pred = ops.reshape(y_pred, newshape=(-1, vocabulary_size))
        return ops.mean(
            losses.categorical_focal_crossentropy(
                y_true,
                y_pred,
                alpha=alpha,
                gamma=gamma,
                from_logits=False,
                label_smoothing=label_smoothing,
            )
        )

    return cce


def cat_acc_metric(max_plate_slots, vocabulary_size):
    def char_acc(y_true, y_pred):
        y_true = ops.reshape(y_true, newshape=(-1, max_plate_slots, vocabulary_size))
        y_pred = ops.reshape(y_pred, newshape=(-1, max_plate_slots, vocabulary_size))
        return ops.mean(metrics.categorical_accuracy(y_true, y_pred))

    return char_acc


def plate_acc_metric(max_plate_slots, vocabulary_size):
    def acc(y_true, y_pred):
        y_true = ops.reshape(y_true, newshape=(-1, max_plate_slots, vocabulary_size))
        y_pred = ops.reshape(ops.cast(y_pred, "float32"), newshape=(-1, max_plate_slots, vocabulary_size))
        et = ops.equal(ops.argmax(y_true, axis=-1), ops.argmax(y_pred, axis=-1))
        return ops.mean(ops.cast(ops.all(et, axis=-1, keepdims=False), dtype="float32"))

    return acc


def top_3_k_metric(vocabulary_size):
    def top3_acc(y_true, y_pred):
        y_true = ops.reshape(y_true, newshape=(-1, vocabulary_size))
        y_pred = ops.reshape(ops.cast(y_pred, "float32"), newshape=(-1, vocabulary_size))
        return ops.mean(metrics.top_k_categorical_accuracy(y_true, y_pred, k=3))

    return top3_acc


def plate_len_acc_metric(max_plate_slots, vocabulary_size, pad_token_index):
    def len_acc(y_true, y_pred):
        y_true = ops.reshape(y_true, (-1, max_plate_slots, vocabulary_size))
        y_pred = ops.reshape(ops.cast(y_pred, "float32"), (-1, max_plate_slots, vocabulary_size))
        true_idx = ops.argmax(y_true, axis=-1)
        pred_idx = ops.argmax(y_pred, axis=-1)
        true_len = ops.sum(ops.cast(ops.not_equal(true_idx, pad_token_index), "int32"), axis=-1)
        pred_len = ops.sum(ops.cast(ops.not_equal(pred_idx, pad_token_index), "int32"), axis=-1)
        return ops.mean(ops.cast(ops.equal(true_len, pred_len), dtype="float32"))

    return len_acc


def build_custom_objects(config):
    """
    Map the checkpoint's compile-config names to the factory functions.

    Values are the raw factories (not closures); Keras only needs them to
    resolve the names stored in the saved compile config.
    """
    return {
        "cce": cce_loss,
        "focal_cce": focal_cce_loss,
        "char_acc": cat_acc_metric,
        "acc": plate_acc_metric,
        "top3_acc": top_3_k_metric,
        "len_acc": plate_len_acc_metric,
        "cat_acc": cat_acc_metric,
        "plate_acc": plate_acc_metric,
        "top_3_k": top_3_k_metric,
        "plate_len_acc": plate_len_acc_metric,
    }