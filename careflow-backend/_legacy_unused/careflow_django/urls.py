from django.urls import include, path
from api.views import health, root

urlpatterns = [
    path("", root),
    path("api/health", health),
    path("api/", include("api.urls")),
]
