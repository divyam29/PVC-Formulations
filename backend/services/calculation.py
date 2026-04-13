from typing import Dict, Iterable


TYPE_MISC_COST = {
    "Garden": 10.0,
    "Recycled": 11.0,
    "Braided": 12.0,
}


def round_money(value: float) -> float:
    return round(value, 2)


def calculate_material_amount_per_kg(unit_price: float, gst: float, extra: float) -> float:
    return round_money(unit_price * (1 + gst / 100) + extra)


def calculate_component_totals(items: Iterable[dict], materials_by_id: Dict[str, dict]) -> tuple[float, float]:
    total_qty = 0.0
    total_amount = 0.0

    for item in items:
        material = materials_by_id[item["material_id"]]
        qty = float(item["quantity"])
        total_qty += qty
        total_amount += qty * float(material["amount_per_kg"])

    return total_qty, total_amount


def calculate_formulation_metrics(
    formulation_type: str,
    fixed_profit: float,
    without_for: bool,
    items: Iterable[dict],
    coating_percent: float,
    coating_items: Iterable[dict],
    materials_by_id: Dict[str, dict],
) -> dict:
    base_qty, base_amount = calculate_component_totals(items, materials_by_id)

    total_qty = base_qty
    total_amount = base_amount
    price_per_kg = total_amount / total_qty

    if coating_percent > 0:
        coating_qty, coating_amount = calculate_component_totals(coating_items, materials_by_id)
        base_share = (100 - coating_percent) / 100
        coating_share = coating_percent / 100
        base_price_per_kg = base_amount / base_qty
        coating_price_per_kg = coating_amount / coating_qty
        price_per_kg = (base_price_per_kg * base_share) + (coating_price_per_kg * coating_share)
        total_qty = (base_qty * base_share) + (coating_qty * coating_share)
        total_amount = price_per_kg * total_qty

    if total_qty <= 0:
        raise ValueError("Total quantity must be greater than zero.")
    misc = TYPE_MISC_COST[formulation_type]

    if not without_for:
        misc -= 1.5

    final_cost = price_per_kg + misc
    sale_price = final_cost + fixed_profit
    profit = sale_price - final_cost
    profit_percent_cost = (profit / final_cost) * 100 if final_cost else 0.0
    profit_percent_sale = (profit / sale_price) * 100 if sale_price else 0.0

    return {
        "total_qty": round_money(total_qty),
        "total_amount": round_money(total_amount),
        "price_per_kg": round_money(price_per_kg),
        "misc": round_money(misc),
        "final_cost": round_money(final_cost),
        "sale_price": round_money(sale_price),
        "profit": round_money(profit),
        "profit_percent_cost": round_money(profit_percent_cost),
        "profit_percent_sale": round_money(profit_percent_sale),
    }
