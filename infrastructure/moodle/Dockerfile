# Moodle 5.3.1 LTS sin modificar Core: los cambios viven en moodle-custom/ (plugin local y tema).
FROM moodlehq/moodle-php-apache:8.4

ARG MOODLE_VERSION=5.3.1
ARG MOODLE_SHA256=820ee2bcd89acc6b91df255b2010bbbab108f29952ab78895a79c4feabf541e7

# Capa pesada primero: los cambios del plugin o tema no vuelven a ejecutarla.
RUN set -eux; \
    curl -fsSL -o /tmp/moodle.tgz "https://download.moodle.org/download.php/direct/stable503/moodle-${MOODLE_VERSION}.tgz"; \
    echo "${MOODLE_SHA256}  /tmp/moodle.tgz" | sha256sum -c -; \
    rm -rf /var/www/html; mkdir -p /var/www/html /var/www/moodledata; \
    tar -xzf /tmp/moodle.tgz -C /var/www/html --strip-components=1 --no-same-owner; \
    rm /tmp/moodle.tgz; \
    chown -R root:www-data /var/www/html; chmod -R g+rX,g-w,o-rwx /var/www/html; \
    chown www-data:www-data /var/www/moodledata; \
    sed -ri 's#DocumentRoot /var/www/html$#DocumentRoot /var/www/html/public#' /etc/apache2/sites-available/000-default.conf

COPY --chown=root:www-data --chmod=750 moodle-custom/local/iinicia /var/www/html/public/local/iinicia
COPY --chown=root:www-data --chmod=750 moodle-custom/theme/iinicia /var/www/html/public/theme/iinicia
COPY --chown=root:www-data --chmod=640 infrastructure/moodle/config.php /var/www/html/config.php
COPY infrastructure/moodle/apache-moodle.conf /etc/apache2/conf-enabled/zz-moodle.conf
COPY --chmod=755 infrastructure/moodle/entrypoint.sh /usr/local/bin/iinicia-entrypoint.sh
COPY --chmod=755 infrastructure/moodle/cron.sh /usr/local/bin/iinicia-cron.sh
RUN sed -i 's/\r$//' /usr/local/bin/iinicia-entrypoint.sh /usr/local/bin/iinicia-cron.sh

ENV APACHE_DOCUMENT_ROOT=/var/www/html/public

ENTRYPOINT ["/usr/local/bin/iinicia-entrypoint.sh"]
CMD ["apache2-foreground"]
