(function (global) {
  'use strict';

  function text(value) {
    return typeof value === 'string' ? value : '';
  }

  function isHOD(designation) {
    const normalized = text(designation).replace(/\s+/g, ' ').trim();
    return /\bh\s*[.\/-]?\s*o\s*[.\/-]?\s*d\b\.?|\bhead\s+of\s+(?:the\s+)?department\b/i.test(normalized);
  }

  function selectStaff(data) {
    const teachingStaff = Array.isArray(data.teaching_staff) ? data.teaching_staff.slice() : [];
    const nonTeachingStaff = Array.isArray(data.non_teaching_staff) ? data.non_teaching_staff.slice() : [];
    const candidates = teachingStaff.filter(function (staff) {
      return staff && isHOD(staff.designation);
    });
    const hod = candidates.length === 1 ? candidates[0] : null;

    if (candidates.length > 1) {
      console.warn('Multiple HOD candidates; all records retained in Teaching Staff.', {
        candidates: candidates.map(function (staff) { return text(staff.name); })
      });
    }

    return {
      hod: hod,
      teachingStaff: hod ? teachingStaff.filter(function (staff) { return staff !== hod; }) : teachingStaff,
      nonTeachingStaff: nonTeachingStaff
    };
  }

  function imageURL(value) {
    try {
      const url = new URL(text(value).trim());
      return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password
        ? url.href : '';
    } catch (error) {
      return '';
    }
  }

  // Also keeps existing staff-card portrait clicks safe without changing their styling.
  function configureStaffImage(img, staff) {
    const url = imageURL(staff.picture);
    img.alt = text(staff.name) ? 'Portrait of ' + staff.name : 'Staff portrait';
    function fallback() {
      img.removeAttribute('src');
      img.alt = 'Photo unavailable' + (text(staff.name) ? ' for ' + staff.name : '');
      img.style.backgroundColor = '#f3f5f3';
      img.onclick = null;
    }
    img.onerror = fallback;
    if (url) {
      img.src = url;
      img.onclick = function () { global.open(url, '_blank', 'noopener,noreferrer'); };
    } else {
      fallback();
    }
  }

  function emailContact(value) {
    const email = text(value).trim();
    if (!/^[a-z0-9.!#$%&'*+\-/=?^_`{|}~]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(email)) {
      return null;
    }
    return { label: email, href: 'mailto:' + encodeURIComponent(email), icon: 'fa-envelope-o' };
  }

  function phoneContact(value) {
    const phone = (typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : text(value)).trim();
    if (!/^\+?[0-9\s().-]+$/.test(phone)) return null;
    const dial = phone.replace(/[\s().-]/g, '');
    if (!/^\+?[0-9]{5,15}$/.test(dial)) return null;
    return { label: phone, href: 'tel:' + dial, icon: 'fa-phone' };
  }

  function element(tag, className, content) {
    const node = document.createElement(tag);
    node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }

  function render(hod, mount) {
    if (!mount) return;
    mount.replaceChildren();
    if (!hod) return;

    const section = element('section', 'department-hod');
    const heading = element('h2', 'department-hod__heading', 'Head of Department');
    heading.id = 'department-hod-heading';
    section.setAttribute('aria-labelledby', heading.id);
    section.appendChild(heading);

    const card = element('div', 'department-hod__card');
    const portrait = element('div', 'department-hod__portrait');
    const fallback = element('span', 'department-hod__fallback', 'Photo unavailable');
    portrait.appendChild(fallback);
    const picture = imageURL(hod.picture);
    if (picture) {
      const img = element('img', 'department-hod__image');
      img.width = 220;
      img.height = 280;
      img.alt = text(hod.name) ? 'Portrait of ' + hod.name + ', Head of Department' : 'Head of Department portrait';
      img.onerror = function () {
        img.remove();
        fallback.hidden = false;
      };
      fallback.hidden = true;
      img.src = picture;
      portrait.appendChild(img);
    }
    card.appendChild(portrait);

    const details = element('div', 'department-hod__details');
    if (text(hod.name).trim()) details.appendChild(element('h3', 'department-hod__name', hod.name));
    if (text(hod.designation).trim()) details.appendChild(element('p', 'department-hod__designation', hod.designation));

    const contacts = [emailContact(hod.email), phoneContact(hod.mobile_number)].filter(Boolean);
    if (contacts.length) {
      const list = element('ul', 'department-hod__contacts');
      contacts.forEach(function (contact) {
        const item = element('li', 'department-hod__contact');
        const link = element('a', 'department-hod__link');
        link.href = contact.href;
        const icon = element('i', 'fa ' + contact.icon);
        icon.setAttribute('aria-hidden', 'true');
        link.appendChild(icon);
        link.appendChild(element('span', 'department-hod__contact-text', contact.label));
        item.appendChild(link);
        list.appendChild(item);
      });
      details.appendChild(list);
    }
    if (text(hod.bio).trim()) details.appendChild(element('p', 'department-hod__bio', hod.bio));
    card.appendChild(details);
    section.appendChild(card);
    mount.appendChild(section);
  }

  function showError(staffMount, hodMount) {
    if (hodMount) hodMount.replaceChildren();
    if (!staffMount) return;
    const message = element('p', 'department-staff-error', 'Staff details are temporarily unavailable. Please try again later.');
    message.setAttribute('role', 'status');
    staffMount.replaceChildren(message);
  }

  global.DepartmentHOD = Object.freeze({
    text: text,
    isHOD: isHOD,
    selectStaff: selectStaff,
    imageURL: imageURL,
    configureStaffImage: configureStaffImage,
    render: render,
    showError: showError
  });
})(window);
